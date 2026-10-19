import { useState, type ReactNode } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  MessageCircle,
  PanelBottom,
  Save,
  Terminal,
  X,
} from "lucide-react";
import { client } from "../../lib/client";
import { load, save } from "../../lib/storage";
const demo: Record<string, string> = {
  "README.md":
    "# A little space to build\n\nWelcome to your Bluey scratchpad.\n\nThese are local example files, not a connected project.\nEdits are saved in this app. Open a folder in the Windows\napp to work with files on your computer.\n\nYour assistant is right beside you. Ask it anything.\n",
  "hello.py":
    '"""Small beginnings. Big possibilities."""\n\nfrom datetime import datetime\n\n\ndef say_hello(name: str = "friend") -> str:\n    hour = datetime.now().hour\n    greeting = "Good morning" if hour < 12 else "Hello"\n    return f"{greeting}, {name}. Let’s make something."\n\n\nif __name__ == "__main__":\n    print(say_hello("Bluey"))\n',
  "companion.ts":
    'type Mood = "listening" | "thinking" | "happy";\n\ninterface Companion {\n  name: string;\n  mood: Mood;\n  localFirst: boolean;\n}\n\nexport const bluey: Companion = {\n  name: "Bluey",\n  mood: "happy",\n  localFirst: true,\n};\n',
};
export function CodeWorkspace({
  chat,
  logs,
  notify,
  connected,
}: {
  chat: ReactNode;
  logs: string[];
  notify: (s: string) => void;
  connected: boolean;
}) {
  const [files, setFiles] = useState<Record<string, string>>(() =>
    load("bluey.scratchpad", demo),
  );
  const [paths, setPaths] = useState(Object.keys(files));
  const [active, setActive] = useState("hello.py");
  const [drawer, setDrawer] = useState(true);
  const [explorer, setExplorer] = useState(true);
  const [project, setProject] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  async function openProject() {
    if (!window.bluey) {
      notify(
        "Open folder is available in the Windows app. This scratchpad works locally in your browser.",
      );
      return;
    }
    if (!connected) {
      notify("Connect your local engine first.");
      return;
    }
    const root = await window.bluey.chooseFolder();
    if (!root) return;
    try {
      const data = await client.request<{ files: string[] }>(
        "/api/workspace/open",
        { root },
      );
      setProject(root);
      setPaths(data.files);
      setFiles({});
      setActive("");
      setDirty(false);
    } catch (e) {
      notify(String(e));
    }
  }
  async function open(path: string) {
    if (dirty && !confirm("Discard unsaved changes before switching files?"))
      return;
    try {
      if (project) {
        const data = await client.request<{ content: string }>(
          `/api/workspace/file?path=${encodeURIComponent(path)}`,
        );
        setFiles((f) => ({ ...f, [path]: data.content }));
      }
      setActive(path);
      setDirty(false);
    } catch (e) {
      notify(String(e));
    }
  }
  async function write() {
    setSaving(true);
    try {
      if (project)
        await client.request(
          "/api/workspace/file",
          { path: active, content: files[active] },
          "PUT",
        );
      else save("bluey.scratchpad", files);
      setDirty(false);
      notify(project ? "File saved." : "Scratchpad saved on this device.");
    } catch (e) {
      notify(String(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="ide">
      <div className="ide-main">
        <aside className={`file-explorer ${explorer ? "" : "collapsed"}`}>
          <div className="ide-panel-title">
            <button
              onClick={() => setExplorer(!explorer)}
              title="Toggle file explorer"
            >
              {explorer ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
            </button>
            {explorer && (
              <>
                <span>EXPLORER</span>
                <button title="Open folder" onClick={() => void openProject()}>
                  <FolderOpen size={15} />
                </button>
              </>
            )}
          </div>
          {explorer && (
            <>
              <button
                className="project-title"
                onClick={() => void openProject()}
              >
                <Folder size={14} />
                {project ? project.split(/[\/]/).pop() : "LOCAL SCRATCHPAD"}
              </button>
              {paths.map((f) => (
                <button
                  key={f}
                  className={`file-entry ${f === active ? "active" : ""}`}
                  onClick={() => void open(f)}
                >
                  {f.endsWith(".md") ? (
                    <FileText size={15} />
                  ) : (
                    <FileCode2 size={15} />
                  )}
                  <span>{f}</span>
                </button>
              ))}
              <div className="explorer-note">
                {project
                  ? "Only this selected folder is accessible."
                  : "Example files · stored on this device"}
              </div>
            </>
          )}
        </aside>
        <div className="editor-column">
          <div className="editor-tabs">
            <span>
              <FileCode2 size={14} />
              {active || "No file open"}
              {dirty && <i />}
            </span>
            <button
              className="icon-button"
              disabled={!active || saving}
              title="Save file"
              onClick={() => void write()}
            >
              <Save size={15} />
            </button>
            <button
              className="icon-button"
              title="Toggle logs"
              onClick={() => setDrawer(!drawer)}
            >
              <PanelBottom size={16} />
            </button>
          </div>
          <div className="editor-breadcrumb">
            {project ? "Workspace" : "Scratchpad"} <ChevronRight size={11} />{" "}
            {active}
          </div>
          {active ? (
            <CodeMirror
              className="code-editor"
              value={files[active] ?? ""}
              height="100%"
              theme="dark"
              extensions={
                active.endsWith(".py")
                  ? [python()]
                  : [javascript({ typescript: true, jsx: true })]
              }
              onChange={(value) => {
                setFiles((f) => ({ ...f, [active]: value }));
                setDirty(true);
              }}
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
                highlightActiveLine: true,
                autocompletion: true,
              }}
            />
          ) : (
            <div className="editor-empty">
              <FolderOpen size={30} />
              <p>Choose a file to get started.</p>
            </div>
          )}
          {drawer && (
            <div className="terminal-drawer">
              <div className="terminal-tabs">
                <span>
                  <Terminal size={13} />
                  ENGINE LOGS
                </span>
                <span>Read-only</span>
                <button title="Close logs" onClick={() => setDrawer(false)}>
                  <X size={14} />
                </button>
              </div>
              <div className="terminal-lines">
                {logs.map((line, i) => (
                  <div key={i}>
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    {line}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="editor-status">
            <span>{dirty ? "● Unsaved changes" : "✓ All changes saved"}</span>
            <span>
              UTF-8 · {active.endsWith(".py") ? "Python" : "TypeScript / Text"}
            </span>
          </div>
        </div>
      </div>
      <aside className="ide-chat">
        <div className="ide-panel-title">
          <MessageCircle size={14} />
          <span>YOUR THOUGHT PARTNER</span>
        </div>
        {chat}
      </aside>
    </div>
  );
}
