import { useEffect, useRef, useState } from "react";
import type { BlueyClient } from "../lib/client";
import { DeviceSpeech } from "../lib/deviceSpeech";
import {
  MeetingDetector,
  SessionMemory,
  type MeetingDraft,
} from "../lib/quietSession";
import { SessionRecorder } from "../lib/sessionRecorder";

export function useQuietSession(
  client: BlueyClient,
  native: boolean,
  connected: boolean,
  microphoneId?: string,
) {
  const [view, setView] = useState({
    active: false,
    listening: false,
    asking: false,
    transitioning: false,
    busy: false,
    reply: "",
    error: "",
    meeting: false,
    trimmed: false,
  });
  const [consent, setConsent] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [autoMeeting, setAutoMeeting] = useState(true);
  const [drafts, setDrafts] = useState<MeetingDraft[]>([]);
  const [chirps, setChirps] = useState(true);
  const props = useRef({
    connected,
    consent,
    autoMeeting,
    chirps,
    microphoneId,
    draftsCount: drafts.length,
  });
  props.current = {
    connected,
    consent,
    autoMeeting,
    chirps,
    microphoneId,
    draftsCount: drafts.length,
  };
  const state = useRef({
    active: false,
    asking: false,
    holdRequested: false,
    ending: false,
    generation: 0,
    alive: true,
    pending: 0,
    queue: Promise.resolve(),
    question: "",
    request: "",
    reply: "",
    polled: 0,
    meetingPoll: false,
    unlocked: false,
    seen: new Set<string>(),
    memory: new SessionMemory(),
    detector: new MeetingDetector(),
  });
  const recorder = useRef<SessionRecorder | null>(null);
  if (!recorder.current)
    recorder.current = new SessionRecorder(
      native,
      async (audio) =>
        (
          await client.request<{ text: string }>("/api/companion/transcribe", {
            audio,
          })
        ).text,
      () => props.current.microphoneId,
    );
  function patch(p: Partial<typeof view>) {
    if (state.current.alive) setView((v) => ({ ...v, ...p }));
  }
  function finishMeeting(reason: string) {
    const draft = state.current.memory.endMeeting(reason);
    if (draft && state.current.alive) setDrafts((ds) => [...ds, draft]);
    patch({ meeting: false });
  }
  function cancel(reason = "") {
    const s = state.current;
    if (s.request && props.current.connected) {
      try {
        client.send({ type: "cancel_request", request: s.request });
      } catch {
        /* disconnected */
      }
    }
    s.generation++;
    s.active = false;
    s.asking = false;
    s.holdRequested = false;
    s.ending = false;
    s.request = "";
    s.question = "";
    void recorder.current!.cancel().catch(() => {});
    finishMeeting(reason || "Session ended.");
    s.memory.clear();
    patch({
      active: false,
      listening: false,
      asking: false,
      transitioning: false,
      busy: false,
      error: reason,
    });
    if (props.current.connected) {
      try {
        client.send({ type: "session_state", active: false });
      } catch {
        /* disconnected */
      }
    }
  }
  function serial(work: (generation: number) => Promise<void>) {
    const s = state.current,
      generation = s.generation;
    s.pending++;
    s.queue = s.queue
      .then(async () => {
        if (generation === s.generation) await work(generation);
      })
      .catch((e) => {
        if (generation === s.generation)
          cancel(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        s.pending--;
      });
    return s.queue;
  }
  async function cut(
    generation: number,
    restart = true,
    snapshot?: Promise<string>,
  ) {
    const s = state.current,
      asking = s.asking;
    if (native) patch({ listening: false });
    const text = await recorder.current!.cut(snapshot);
    if (generation !== s.generation) return;
    if (asking) s.question = (s.question + " " + text).trim().slice(0, 8000);
    const full = s.memory.add(text);
    patch({ trimmed: s.memory.contextTrimmed });
    if (full) {
      finishMeeting(
        "Transcript size limit reached; save these notes before starting another meeting.",
      );
      cancel(
        "Meeting transcript limit reached. Start a new session after saving.",
      );
      return;
    }
    if (restart && s.active && !s.ending) {
      await recorder.current!.restart();
      if (generation === s.generation) patch({ listening: true });
    }
  }
  async function start() {
    const s = state.current;
    if (s.active || s.pending) return;
    if (drafts.length >= 5) {
      patch({
        error:
          "Save or discard meeting drafts before starting another session.",
      });
      return;
    }
    if (!props.current.connected) {
      patch({ error: "Connect to Windows before starting a session." });
      return;
    }
    if (!props.current.consent) {
      setConsentOpen(true);
      return;
    }
    if (document.hidden && (native || !window.bluey)) {
      patch({ error: "Return to Bluey to start a session." });
      return;
    }
    s.generation++;
    s.active = true;
    s.ending = false;
    s.asking = false;
    s.unlocked = true;
    s.memory.clear();
    s.detector = new MeetingDetector();
    patch({
      active: true,
      transitioning: true,
      error: "",
      reply: "",
      trimmed: false,
    });
    await serial(async (generation) => {
      await recorder.current!.start();
      if (generation !== s.generation) return;
      patch({ listening: true, transitioning: false });
      client.send({ type: "session_state", active: true });
    });
  }
  function stop() {
    const s = state.current;
    if (!s.active || s.ending) return;
    if (s.pending) {
      cancel("Session stopped; the unfinished utterance may be missing.");
      return;
    }
    s.ending = true;
    patch({ transitioning: true, listening: false });
    void serial(async (generation) => {
      // Snapshot the final chunk, then release the microphone BEFORE transcription completes.
      const pending = cut(generation, false);
      if (!native) await recorder.current!.cancel();
      await pending;
      if (native) await recorder.current!.cancel();
      if (generation === s.generation) cancel();
    });
  }
  function toggle() {
    if (state.current.active) stop();
    else void start();
  }
  function ask(text: string) {
    const s = state.current;
    if (s.request || !text.trim() || !props.current.connected) return;
    const request = crypto.randomUUID();
    s.request = request;
    s.reply = "";
    s.unlocked = true;
    patch({ busy: true, reply: "", error: "" });
    try {
      if (/\bwhat(?:['’]s| is) this\b/i.test(text))
        client.send({ type: "point_at_mouse" });
      client.send({
        type: "chat",
        request,
        voice: false,
        messages: s.memory.messages(text),
        session: true,
      });
    } catch (error) {
      s.request = "";
      patch({ busy: false, error: String(error) });
    }
  }
  function hold() {
    const s = state.current;
    if (!s.active || s.ending || s.asking || s.holdRequested || s.request)
      return;
    s.holdRequested = true;
    patch({ transitioning: true });
    const snapshot = recorder.current!.snapshot();
    void serial(async (generation) => {
      await cut(generation, false, snapshot);
      if (generation !== s.generation || s.ending) return;
      s.asking = true;
      s.question = "";
      await recorder.current!.restart();
      if (generation === s.generation)
        patch({ asking: true, listening: true, transitioning: false });
    });
  }
  function release(cancelled = false) {
    const s = state.current;
    if (!s.active || s.ending || !s.holdRequested) return;
    s.holdRequested = false;
    const snapshot = recorder.current!.snapshot();
    void serial(async (generation) => {
      if (!s.asking) return;
      await cut(generation, false, snapshot);
      if (generation !== s.generation) return;
      s.asking = false;
      const question = s.question;
      s.question = "";
      await recorder.current!.restart();
      if (generation !== s.generation) return;
      patch({ asking: false, listening: true, transitioning: false });
      if (!cancelled) {
        if (question) ask(question);
        else
          patch({
            error:
              "No question recognized. Hold, wait for “Release to ask”, then speak.",
          });
      }
    });
  }
  function meetingToggle() {
    if (!state.current.active) return;
    if (!state.current.memory.meeting && props.current.draftsCount >= 5) {
      patch({
        error:
          "Save or discard meeting drafts before starting another meeting.",
      });
      return;
    }
    void serial(async (generation) => {
      await cut(generation);
      if (generation !== state.current.generation) return;
      if (state.current.memory.meeting)
        finishMeeting("Meeting ended manually.");
      else {
        state.current.memory.beginMeeting();
        patch({ meeting: true });
      }
    });
  }
  const actions = useRef({ toggle, cancel });
  actions.current = { toggle, cancel };
  useEffect(() => {
    const s = state.current;
    s.alive = true;
    const off = client.subscribe((p) => {
      if (p.type === "session_toggle") actions.current.toggle();
      if (p.type === "stopped") actions.current.cancel("Stopped.");
      if (p.type === "companion_sleep") actions.current.cancel();
      if (p.type === "token" && p.request === s.request) {
        s.reply = (s.reply + String(p.text)).slice(0, 16000);
        patch({ reply: s.reply });
      }
      if (p.type === "error" && (p.request === s.request || !p.request)) {
        s.request = "";
        patch({ busy: false, error: String(p.text) });
      }
      if (p.type === "done" && p.request === s.request) {
        if (s.reply)
          s.memory.add(
            "Bluey replied: " + s.reply,
            new Date().toISOString(),
            false,
          );
        s.request = "";
        patch({ busy: false });
      }
      if (
        p.type === "response" &&
        native &&
        props.current.chirps &&
        s.unlocked &&
        !document.hidden &&
        !s.seen.has(String(p.request))
      ) {
        s.seen.add(String(p.request));
        if (s.seen.size > 100) s.seen.delete(s.seen.values().next().value!);
        void DeviceSpeech.chirp().catch(() =>
          patch({ error: "Reply is ready. The phone chirp could not play." }),
        );
      }
    });
    const hidden = () => {
      if (document.hidden && (native || !window.bluey))
        actions.current.cancel(
          "Session stopped while Bluey was hidden. The last unfinished utterance may be missing.",
        );
    };
    document.addEventListener("visibilitychange", hidden);
    const timer = setInterval(() => {
      if (!s.active || s.ending || s.pending) return;
      void serial(async (generation) => {
        if (await recorder.current!.ready()) await cut(generation);
      });
      if (
        !props.current.autoMeeting ||
        s.meetingPoll ||
        Date.now() - s.polled < 5000
      )
        return;
      s.polled = Date.now();
      s.meetingPoll = true;
      const generation = s.generation;
      void client
        .request<{ active: boolean | null; supported: boolean }>(
          "/api/companion/meeting",
        )
        .then((signal) => {
          if (generation !== s.generation || !s.active) return;
          const change = s.detector.observe(signal.active, Date.now());
          if (
            change === "start" &&
            !s.memory.meeting &&
            props.current.draftsCount < 5
          ) {
            s.memory.beginMeeting();
            patch({ meeting: true });
          }
          if (change === "end" && s.memory.meeting) {
            void serial(async (g) => {
              await cut(g);
              if (g === s.generation)
                finishMeeting(
                  "Meeting window no longer detected. This is an estimate; use manual controls if the call continues.",
                );
            });
          }
        })
        .catch(() => {
          s.detector.observe(null, Date.now());
        })
        .finally(() => {
          s.meetingPoll = false;
        });
    }, 400);
    return () => {
      s.alive = false;
      actions.current.cancel();
      clearInterval(timer);
      off();
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [client, native]);
  useEffect(() => {
    if (!connected && state.current.active)
      cancel("Connection lost. Session stopped; saved drafts remain here.");
  }, [connected]);
  return {
    ...view,
    consent,
    setConsent,
    allow: () => {
      props.current.consent = true;
      setConsent(true);
      setConsentOpen(false);
      void start();
    },
    consentOpen,
    setConsentOpen,
    autoMeeting,
    setAutoMeeting,
    chirps,
    setChirps,
    drafts,
    discardDraft: (id: string) =>
      setDrafts((ds) => ds.filter((d) => d.id !== id)),
    start,
    stop,
    toggle,
    hold,
    release,
    ask,
    meetingToggle,
    cancel,
  };
}
export type QuietSession = ReturnType<typeof useQuietSession>;
