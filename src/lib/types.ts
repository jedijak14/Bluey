export type Mood =
  | "listening"
  | "resting"
  | "thinking"
  | "talking"
  | "pointing"
  | "happy"
  | "sleepy";
export type Trail = "comet" | "string" | "none";
export interface FaceState {
  mood: Mood;
  gazeX: number;
  gazeY: number;
  talk: number;
}
export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: { title: string; url: string; snippet?: string }[];
}
export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  updated: number;
}
export interface Settings {
  microphoneId?: string;
  endpoint: string;
  token: string;
  model: string;
  provider: "ollama" | "openai";
  modelUrl: string;
  voice: boolean;
  trail: Trail;
  cursorSize: number;
  glow: boolean;
}
export type Packet = { type: string; [key: string]: unknown };
export interface Bridge {
  startOllama?: () => Promise<{ message: string }>;
  connection: () => Promise<{ endpoint: string; token: string }>;
  window: (
    action:
      | "minimize"
      | "maximize"
      | "close"
      | "overlay"
      | "stop"
      | "approval"
      | "yield"
      | "workspace"
      | "session"
      | "microphone"
      | "resume-overlay",
  ) => void;
  openExternal?: (url: string) => Promise<void>;
  onCommand?: (callback: (command: string) => void) => () => void;
  chooseFolder: () => Promise<string | null>;
  overlayLayout?: () => Promise<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  onOverlayLayout?: (
    cb: (area: { x: number; y: number; width: number; height: number }) => void,
  ) => () => void;
  onPointer: (cb: (p: { x: number; y: number }) => void) => () => void;
  interactive: (value: boolean) => void;
}
declare global {
  interface Window {
    bluey?: Bridge;
  }
}
