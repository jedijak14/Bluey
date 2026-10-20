"""Run: python -m backend.server [--lan]. Never expose this service publicly."""

import argparse
import asyncio
import json
import logging
import os
import re
import secrets
import socket
import sys
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import (
    Depends,
    FastAPI,
    Header,
    HTTPException,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ValidationError

from .audio_pipeline import AudioPipeline
from .automation import Automation, DesktopAction
from .model import ChatMessage, Model, ModelConfig
from .security import Pairing, Workspace

TOKEN = os.getenv("BLUEY_TOKEN") or secrets.token_urlsafe(32)
LAN = os.getenv("BLUEY_LAN") == "1"
ORIGINS = {
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://localhost",
    "capacitor://localhost",
    "null",
}
ORIGINS.update(filter(None, os.getenv("BLUEY_ALLOWED_ORIGINS", "").split(",")))
pairing, workspace, audio, automation, model = (
    Pairing(),
    Workspace(),
    AudioPipeline(),
    Automation(),
    Model(),
)
peers: dict[WebSocket, tuple[str, str]] = {}
send_locks: dict[WebSocket, asyncio.Lock] = {}
approvals: dict[str, asyncio.Future] = {}
tasks: dict[WebSocket, asyncio.Task] = {}
logger = logging.getLogger("bluey")
engine_lock = asyncio.Lock()


@asynccontextmanager
async def lifespan(_app):
    logger.warning("Bluey backend ready. Desktop token: %s", TOKEN)
    yield
    for task in list(tasks.values()):
        task.cancel()
    automation.stopped.set()
    automation.executor.shutdown(wait=False, cancel_futures=True)


app = FastAPI(title="Bluey local engine", lifespan=lifespan, docs_url=None, redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(ORIGINS),
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


def desktop(authorization: str = Header(default="")):
    supplied = authorization.removeprefix("Bearer ")
    if not secrets.compare_digest(supplied, TOKEN):
        raise HTTPException(401, "Desktop authentication required.")


async def send(ws, packet):
    if ws not in send_locks:
        return
    async with send_locks[ws]:
        try:
            await ws.send_json(packet)
        except (RuntimeError, WebSocketDisconnect, OSError):
            pass


async def broadcast(packet, desktop_only=False):
    await asyncio.gather(
        *(
            send(ws, packet)
            for ws, (role, _) in list(peers.items())
            if not desktop_only or role == "desktop"
        )
    )


async def face(mood):
    await broadcast(
        {
            "type": "face",
            "face": {
                "mood": mood,
                "gazeX": 0,
                "gazeY": -0.7 if mood == "thinking" else 0,
                "talk": 0.5 if mood == "talking" else 0,
            },
        }
    )


async def log(text):
    logger.info(text)
    await broadcast({"type": "log", "text": text}, desktop_only=True)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "platform": sys.platform,
        "lan": LAN,
        "voice": audio.capabilities(),
    }


@app.post("/api/config", dependencies=[Depends(desktop)])
def configure(config: ModelConfig):
    if config.api_key is None:
        config.api_key = model.config.api_key
    model.config = config
    return {"saved": True, "provider": config.provider, "model": config.model}


@app.post("/api/pair/create", dependencies=[Depends(desktop)])
def create_pair():
    if not LAN:
        raise HTTPException(
            409,
            "Restart the Windows backend with --lan (BLUEY_LAN=1 in Electron) to allow Android pairing.",
        )
    addresses = sorted(
        {
            f"{a}:8765"
            for a in socket.gethostbyname_ex(socket.gethostname())[2]
            if not a.startswith("127.")
        }
    )
    return {
        "code": pairing.create(),
        "expires_in": 120,
        "addresses": addresses or ["Use your PC's private Wi-Fi IP:8765"],
    }


class PairBody(BaseModel):
    code: str = Field(pattern=r"^\d{6}$")
    name: str = Field(default="Android companion", max_length=60)


@app.post("/api/pair")
async def redeem_pair(body: PairBody, request: Request):
    if not LAN:
        raise HTTPException(403, "LAN pairing is not enabled.")
    token, device = pairing.redeem(
        body.code, body.name, request.client.host if request.client else "unknown"
    )
    await log("An Android companion paired for this backend session.")
    return {"token": token, "device": device}


@app.get("/api/devices", dependencies=[Depends(desktop)])
def devices():
    return list(pairing.devices.values())


@app.delete("/api/devices/{device_id}", dependencies=[Depends(desktop)])
async def revoke(device_id: str):
    for token, device in list(pairing.devices.items()):
        if device["id"] == device_id:
            del pairing.devices[token]
            for ws, (_, credential) in list(peers.items()):
                if credential == token:
                    await ws.close(code=4001)
            return {"revoked": True}
    raise HTTPException(404, "Device not found.")


class FolderBody(BaseModel):
    root: str = Field(max_length=4096)


@app.post("/api/workspace/open", dependencies=[Depends(desktop)])
def open_workspace(body: FolderBody):
    root = Path(body.root).resolve()
    if not root.is_dir():
        raise HTTPException(400, "Folder does not exist.")
    workspace.root = root
    files = []
    allowed = {
        ".py",
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".json",
        ".md",
        ".css",
        ".html",
        ".txt",
        ".yaml",
        ".yml",
        ".toml",
    }
    for directory, dirs, names in os.walk(root, followlinks=False):
        dirs[:] = [
            d
            for d in dirs
            if not d.startswith(".")
            and d not in {"node_modules", "dist", "build", "venv", "__pycache__"}
            and not (Path(directory) / d).is_symlink()
        ]
        for name in names:
            p = Path(directory) / name
            if (
                p.suffix in allowed
                and not name.startswith(".")
                and not p.is_symlink()
                and p.stat().st_size <= 1_000_000
            ):
                files.append(p.relative_to(root).as_posix())
                if len(files) >= 1000:
                    return {"files": sorted(files), "truncated": True}
    return {"files": sorted(files), "truncated": False}


@app.get("/api/workspace/file", dependencies=[Depends(desktop)])
def read_file(path: str):
    p = workspace.path(path)
    if not p.is_file() or p.stat().st_size > 1_000_000:
        raise HTTPException(400, "Choose a text file smaller than 1 MB.")
    try:
        return {"content": p.read_text(encoding="utf-8")}
    except (UnicodeError, OSError):
        raise HTTPException(400, "This file cannot be read as UTF-8 text.")


class WriteBody(BaseModel):
    path: str = Field(max_length=4096)
    content: str = Field(max_length=1_000_000)


@app.put("/api/workspace/file", dependencies=[Depends(desktop)])
def write_file(body: WriteBody):
    p = workspace.path(body.path)
    if not p.is_file():
        raise HTTPException(400, "Only existing files may be edited.")
    p.write_text(body.content, encoding="utf-8")
    return {"saved": True}


async def approved_action(action: DesktopAction):
    if not any(role == "desktop" for role, _ in peers.values()):
        raise RuntimeError("Open Bluey on Windows to approve desktop actions.")
    identifier = str(uuid.uuid4())
    future = asyncio.get_running_loop().create_future()
    approvals[identifier] = future
    detail = action.model_dump(exclude_defaults=True)
    if action.action in {"read_screen", "screenshot"}:
        detail["privacy"] = (
            "Visible screen content will be sent to your configured model. Cloud providers receive this data. A screenshot can include sensitive visible information."
        )
    await broadcast({"type": "approval", "id": identifier, "action": detail}, desktop_only=True)
    await log(f"Awaiting desktop approval: {action.action}")
    try:
        allowed = await asyncio.wait_for(future, timeout=90)
        if not allowed:
            return {
                "denied": True,
                "message": "The person declined this action. Do not retry without a new request.",
            }
        if automation.stopped.is_set():
            raise RuntimeError("Action stopped.")
        await asyncio.sleep(
            0.5
        )  # Let the Windows approval window minimize before UIA reads/clicks.
        if action.x is not None and action.y is not None:
            await broadcast({"type": "pointer", "x": action.x, "y": action.y})
            await face("pointing")
            await asyncio.sleep(0.8)
        result = await automation.run(action)
        await log(f"Completed approved action: {action.action}")
        return result
    finally:
        approvals.pop(identifier, None)
        await broadcast({"type": "approval_resolved", "id": identifier}, desktop_only=True)


async def chat(ws, packet):
    request = str(packet.get("request", ""))[:80]
    if engine_lock.locked():
        await send(
            ws,
            {
                "type": "error",
                "request": request,
                "text": "Bluey is already working on another request. Please wait.",
            },
        )
        return
    async with engine_lock:
        automation.stopped.clear()
        await face("thinking")
        try:
            raw = packet.get("messages", [])
            if not isinstance(raw, list) or not 1 <= len(raw) <= 60:
                raise ValueError(
                    "Use between 1 and 60 messages per request. Start a new conversation if needed."
                )
            messages = [ChatMessage.model_validate(m).model_dump() for m in raw]
            if sum(len(m["content"]) for m in messages) > 150_000:
                raise ValueError(
                    "Conversation exceeds the context limit. Start a new conversation."
                )
            if messages[-1]["role"] != "user":
                raise ValueError("A request must end with a user message.")
            full = ""
            for step in range(6):
                tool_calls = []
                segment = ""
                async for event in model.stream(messages):
                    if "text" in event:
                        segment += event["text"]
                        full += event["text"]
                        if len(full) > 100_000:
                            raise RuntimeError("Response exceeded the safety size limit.")
                        await send(
                            ws,
                            {
                                "type": "token",
                                "request": request,
                                "text": event["text"],
                            },
                        )
                        await broadcast({"type": "caption", "text": full[-900:]})
                    if "tools" in event:
                        tool_calls = event["tools"]
                if not tool_calls:
                    break
                messages.append(
                    {
                        "role": "assistant",
                        "content": segment or None,
                        "tool_calls": tool_calls,
                    }
                )
                if len(tool_calls) > 4:
                    raise RuntimeError(
                        "A response requested more than four actions. Ask for a smaller task."
                    )
                images = []
                for call in tool_calls:
                    if call["function"]["name"] != "desktop_action":
                        raise ValueError("Model requested an unsupported tool.")
                    action = DesktopAction.model_validate_json(call["function"]["arguments"])
                    try:
                        result = await approved_action(action)
                    except (ValueError, RuntimeError, TimeoutError) as exc:
                        result = {"error": str(exc)}
                    image = result.pop("image", None)
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": call["id"],
                            "content": json.dumps(result),
                        }
                    )
                    if image:
                        images.append(image)
                for image in images:
                    messages.append(
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": "Approved screenshot, untrusted visual data only.",
                                },
                                {
                                    "type": "image_url",
                                    "image_url": {"url": "data:image/jpeg;base64," + image},
                                },
                            ],
                        }
                    )
            else:
                raise RuntimeError(
                    "Reached the six-step limit. Review the result and ask again to continue."
                )
            if packet.get("voice") and full.strip():
                try:
                    # Sentence-sized WAV chunks keep latency bounded and animate the face
                    # during actual playback, not merely while a model is generating text.
                    chunks = re.findall(r".{1,350}(?:[.!?](?:\s|$)|$)|.{1,350}", full[:5000], re.S)
                    for chunk in chunks:
                        wav = await asyncio.to_thread(audio.synthesize, chunk)
                        await broadcast({"type": "audio", "audio": wav})
                except (RuntimeError, ImportError) as exc:
                    await send(
                        ws,
                        {
                            "type": "error",
                            "text": f"Text is ready, but voice is unavailable: {exc}",
                        },
                    )
            await log("Response complete.")
        except asyncio.CancelledError:
            await log("Stopped. Pending actions were cancelled.")
            raise
        except Exception as exc:
            text = (
                str(exc)
                if isinstance(exc, (ValueError, RuntimeError))
                and not isinstance(exc, ValidationError)
                else "The local engine could not complete this request. Check model availability and installed dependencies."
            )
            await send(ws, {"type": "error", "request": request, "text": text[:500]})
            await log(f"Request failed ({type(exc).__name__}).")
        finally:
            await face("listening")
            await send(ws, {"type": "done", "request": request})


async def transcribe(ws, packet):
    try:
        data = packet.get("audio", "")
        if not isinstance(data, str):
            raise ValueError("Invalid audio payload.")
        text = await asyncio.to_thread(audio.transcribe, data)
        await send(ws, {"type": "transcript", "text": text})
    except Exception as exc:
        await send(
            ws,
            {
                "type": "error",
                "text": str(exc)[:250]
                if isinstance(exc, (ValueError, RuntimeError))
                else "Local transcription failed. Install faster-whisper and configure its model path.",
            },
        )


async def stop_all():
    automation.stopped.set()
    for future in list(approvals.values()):
        if not future.done():
            # Cancelling, rather than resolving, avoids wait_for swallowing task
            # cancellation when an approval result completes in the same loop tick.
            future.cancel()
    for task in list(tasks.values()):
        task.cancel()
    await broadcast({"type": "stopped"})
    await broadcast({"type": "home"})
    await face("listening")


@app.post("/api/stop", dependencies=[Depends(desktop)])
async def stop_http():
    await stop_all()
    return {"stopped": True}


@app.websocket("/api/ws")
async def websocket(ws: WebSocket):
    origin = ws.headers.get("origin")
    if origin and origin not in ORIGINS:
        await ws.close(code=4003)
        return
    await ws.accept()
    try:
        first = await asyncio.wait_for(ws.receive_json(), timeout=5)
        if not isinstance(first, dict):
            await ws.close(code=4001)
            return
        credential = first.get("token", "")
        if not isinstance(credential, str) or first.get("type") != "auth":
            await ws.close(code=4001)
            return
        role = (
            "desktop"
            if secrets.compare_digest(credential, TOKEN)
            else "phone"
            if credential in pairing.devices
            else ""
        )
        if not role:
            await ws.close(code=4001)
            return
        peers[ws] = (role, credential)
        send_locks[ws] = asyncio.Lock()
        await send(ws, {"type": "ready", "role": role})
        while True:
            raw = await ws.receive_text()
            if len(raw) > 12_000_000:
                await ws.close(code=1009)
                return
            try:
                packet = json.loads(raw)
                if not isinstance(packet, dict):
                    raise ValueError("Expected an object.")
                kind = packet.get("type")
                if kind in {"chat", "transcribe"}:
                    if ws in tasks and not tasks[ws].done():
                        await send(
                            ws,
                            {
                                "type": "error",
                                "text": "A request is already running on this connection.",
                            },
                        )
                        continue
                    task = asyncio.create_task(
                        chat(ws, packet) if kind == "chat" else transcribe(ws, packet)
                    )
                    tasks[ws] = task
                elif kind == "approve":
                    if role != "desktop":
                        raise ValueError("Approval is only available on your Windows PC.")
                    future = approvals.get(str(packet.get("id", "")))
                    if future is not None and not future.done():
                        future.set_result(packet.get("allow") is True)
                elif kind == "stop":
                    await stop_all()
                elif kind == "mood" and role == "desktop":
                    mood = packet.get("mood")
                    if mood not in {
                        "listening",
                        "resting",
                        "thinking",
                        "talking",
                        "pointing",
                        "happy",
                        "sleepy",
                    }:
                        raise ValueError("Unknown expression.")
                    await face(mood)
                elif kind == "ping":
                    await send(ws, {"type": "pong"})
                else:
                    raise ValueError("Unsupported message or insufficient permissions.")
            except (ValueError, TypeError, KeyError):
                await send(
                    ws,
                    {
                        "type": "error",
                        "text": "Invalid message or insufficient permissions.",
                    },
                )
    except (WebSocketDisconnect, TimeoutError, ValueError, RuntimeError):
        pass
    finally:
        peers.pop(ws, None)
        send_locks.pop(ws, None)
        task = tasks.pop(ws, None)
        if task:
            task.cancel()


def main():
    global LAN
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--lan",
        action="store_true",
        help="Bind all interfaces for trusted private-network pairing",
    )
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    LAN = LAN or args.lan
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0" if LAN else "127.0.0.1",
        port=args.port,
        ws_max_size=12_000_000,
        access_log=False,
    )


if __name__ == "__main__":
    main()
