const {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  screen,
  dialog,
  session,
  shell,
} = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs");
const crypto = require("node:crypto");

app.setAppUserModelId("app.bluey.companion");
const dev = process.env.BLUEY_DEV === "1";
const token = process.env.BLUEY_TOKEN || crypto.randomBytes(32).toString("hex");
const endpoint = "http://127.0.0.1:8765";
let main,
  overlay,
  backend,
  pointerTimer,
  stopping = false,
  yieldingOverlay = false;
const root = app.isPackaged
  ? process.resourcesPath
  : path.join(__dirname, "..");
const renderer = app.isPackaged
  ? path.join(app.getAppPath(), "dist", "index.html")
  : path.join(root, "dist", "index.html");
const webPreferences = {
  preload: path.join(__dirname, "preload.cjs"),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
};
const ours = (event) =>
  [main, overlay].some(
    (w) =>
      w &&
      !w.isDestroyed() &&
      event.sender === w.webContents &&
      event.senderFrame === w.webContents.mainFrame,
  );

function secure(window) {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    const valid = dev
      ? url.startsWith("http://localhost:5173/")
      : url.startsWith(pathToFileURL(renderer).href);
    if (!valid) event.preventDefault();
  });
}
function load(window, hash = "") {
  secure(window);
  return dev
    ? window.loadURL(`http://localhost:5173/${hash}`)
    : window.loadFile(renderer, { hash: hash.replace("#", "") });
}
function toggleOverlay() {
  if (!overlay || overlay.isDestroyed()) return;
  overlay.isVisible() ? overlay.hide() : overlay.showInactive();
}
async function emergencyStop() {
  try {
    await fetch(`${endpoint}/api/stop`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    });
  } catch {}
}
function createWindows() {
  main = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 800,
    minHeight: 650,
    title: "Bluey",
    icon: path.join(__dirname, "assets", "icon.png"),
    backgroundColor: "#191a1e",
    frame: false,
    thickFrame: true,
    show: false,
    webPreferences,
  });
  main.once("ready-to-show", () => main.show());
  load(main);
  const bounds = screen.getPrimaryDisplay().bounds;
  overlay = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    focusable: false,
    show: false,
    webPreferences,
  });
  overlay.setAlwaysOnTop(true, "screen-saver");
  overlay.setIgnoreMouseEvents(true, { forward: true });
  load(overlay, "#overlay");
  overlay.once("ready-to-show", () => overlay.showInactive());
  screen.on("display-metrics-changed", () => {
    if (overlay && !overlay.isDestroyed())
      overlay.setBounds(screen.getPrimaryDisplay().bounds);
  });
  pointerTimer = setInterval(() => {
    if (overlay && !overlay.isDestroyed()) {
      const point = screen.getCursorScreenPoint(),
        b = screen.getPrimaryDisplay().bounds;
      overlay.webContents.send("pointer", {
        x: point.x - b.x,
        y: point.y - b.y,
      });
    }
  }, 50);
  main.on("closed", () => app.quit());
  if (!globalShortcut.register("CommandOrControl+Shift+B", toggleOverlay))
    console.warn(
      "Bluey overlay shortcut is already registered by another app.",
    );
  if (!globalShortcut.register("CommandOrControl+Shift+S", emergencyStop))
    console.warn("Bluey stop shortcut is already registered by another app.");
}
function startBackend() {
  if (process.env.BLUEY_EXTERNAL_BACKEND === "1") return;
  const localPython = path.join(
    root,
    ".venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
  const python =
    process.env.BLUEY_PYTHON ||
    (fs.existsSync(localPython)
      ? localPython
      : process.platform === "win32"
        ? "python"
        : "python3");
  backend = spawn(python, ["-m", "backend.server"], {
    cwd: root,
    windowsHide: true,
    env: {
      ...process.env,
      BLUEY_TOKEN: token,
      ANONYMIZED_TELEMETRY: "false",
      PYTHONUNBUFFERED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  backend.stdout.on("data", (data) =>
    console.log(String(data).replaceAll(token, "[redacted]")),
  );
  backend.stderr.on("data", (data) =>
    console.log(String(data).replaceAll(token, "[redacted]")),
  );
  backend.on("error", () =>
    dialog.showErrorBox(
      "Local engine could not start",
      "Install Python 3.10+ and backend dependencies, or set BLUEY_PYTHON to your virtual environment’s Python executable. See README.md.",
    ),
  );
  backend.on("exit", (code) => {
    if (code && !stopping)
      dialog.showErrorBox(
        "Local engine stopped",
        "Check your Python dependencies and make sure port 8765 is available. The interface will remain available.",
      );
  });
}
ipcMain.handle("connection", (event) => {
  if (!ours(event)) throw new Error("Untrusted renderer");
  return { endpoint, token };
});
ipcMain.handle("choose-folder", async (event) => {
  if (!ours(event) || event.sender !== main.webContents) return null;
  const result = await dialog.showOpenDialog(main, {
    title: "Choose Bluey’s workspace",
    properties: ["openDirectory"],
  });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle("open-external", async (event, value) => {
  if (!ours(event) || typeof value !== "string" || value.length > 4096)
    throw new Error("Untrusted link");
  const url = new URL(value);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Only web links are supported");
  await shell.openExternal(url.href);
});
ipcMain.on("window-action", (event, action) => {
  if (!ours(event)) return;
  if (action === "overlay") toggleOverlay();
  if (action === "stop") emergencyStop();
  if (action === "workspace" || action === "microphone") {
    main.restore();
    main.show();
    main.focus();
    if (action === "microphone") main.webContents.send("command", "microphone");
  }
  if (event.sender !== main.webContents) return;
  if (action === "yield") {
    yieldingOverlay = true;
    overlay?.setIgnoreMouseEvents(true, { forward: true });
    overlay?.webContents.send("command", "yield");
  }
  if (action === "resume-overlay") yieldingOverlay = false;
  if (action === "minimize" || action === "yield") main.minimize();
  if (action === "approval") {
    main.restore();
    main.show();
    main.focus();
  }
  if (action === "maximize")
    main.isMaximized() ? main.unmaximize() : main.maximize();
  if (action === "close") main.close();
});
ipcMain.on("overlay-interactive", (event, value) => {
  if (ours(event) && event.sender === overlay.webContents)
    overlay.setIgnoreMouseEvents(yieldingOverlay || !value, { forward: true });
});
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler(
    (contents, permission, callback) =>
      callback(permission === "media" && contents === main?.webContents),
  );
  session.defaultSession.webRequest.onHeadersReceived((details, callback) =>
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; media-src 'self' data: blob:; connect-src 'self' http: https: ws: wss:; object-src 'none'; base-uri 'self'",
        ],
      },
    }),
  );
  startBackend();
  createWindows();
});
app.on("before-quit", () => {
  stopping = true;
  clearInterval(pointerTimer);
  globalShortcut.unregisterAll();
  backend?.kill();
});
app.on("window-all-closed", () => app.quit());
