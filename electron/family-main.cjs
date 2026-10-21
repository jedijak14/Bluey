const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  safeStorage,
  session,
  dialog,
} = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { validateRequest, guardianStatus } = require("./family-bridge.cjs");
const { setupInvocation } = require("./guardian-setup.cjs");
const variant = require("../package.json").blueyVariant;
if (!["home", "kids"].includes(variant))
  throw Error("Build a separate family desktop package.");
app.setAppUserModelId(`app.bluey.${variant}.desktop`);
app.setPath(
  "userData",
  path.join(app.getPath("appData"), `Bluey-${variant}-Desktop`),
);
let main;
const own = (event) =>
  main &&
  !main.isDestroyed() &&
  event.sender === main.webContents &&
  event.senderFrame === main.webContents.mainFrame;
const authorized =
  (fn) =>
  (event, ...args) => {
    if (!own(event)) throw Error("Untrusted window.");
    return fn(...args);
  };
let cachedIdentity;
const identity = async () => {
  if (cachedIdentity) return cachedIdentity;
  if (process.platform !== "win32") return null;
  // Fixed command, no renderer-provided shell arguments. Uses Windows Known
  // Folders rather than trusting child-controlled environment path overrides.
  const system = process.env.SystemRoot || "C:\\Windows";
  const exe = path.join(
    system,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  const { stdout } = await promisify(execFile)(
    exe,
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "@{sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;data=[Environment]::GetFolderPath('CommonApplicationData')}|ConvertTo-Json -Compress",
    ],
    { timeout: 5000, windowsHide: true, maxBuffer: 8192 },
  );
  cachedIdentity = JSON.parse(stdout);
  return cachedIdentity;
};
const stored = () => path.join(app.getPath("userData"), "kid-enrollment.bin");
ipcMain.handle(
  "family-request",
  authorized(async (p, token, body, method) => {
    validateRequest(variant, p, token, body, method);
    try {
      const response = await fetch(
        "https://bluey-plum.vercel.app/api/family/" + p,
        {
          method,
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          redirect: "error",
          signal: AbortSignal.timeout(12000),
        },
      );
      const data = await response.json();
      return { status: response.status, data };
    } catch {
      return {
        status: 503,
        data: { error: "The family service could not be reached." },
      };
    }
  }),
);
ipcMain.handle(
  "guardian-status",
  authorized(async () => {
    if (variant !== "kids") return { state: "parent_app" };
    try {
      const user = await identity();
      if (!user) return { state: "unsupported" };
      const file = path.join(user.data, "Bluey Guardian Status", "status.json");
      if ((await fs.stat(file)).size > 8192) return { state: "unavailable" };
      return guardianStatus(
        JSON.parse(await fs.readFile(file, "utf8")),
        user.sid,
      );
    } catch (e) {
      return { state: e.code === "ENOENT" ? "admin_needed" : "unavailable" };
    }
  }),
);
let setupRunning = false;
ipcMain.handle(
  "guardian-setup",
  authorized(async () => {
    if (variant !== "home" || process.platform !== "win32")
      throw Error("Windows parent Home app required.");
    if (setupRunning)
      throw Error("An administrator setup window is already open.");
    setupRunning = true;
    try {
      const consent = await dialog.showMessageBox(main, {
        type: "warning",
        buttons: ["Cancel", "Open administrator setup"],
        defaultId: 0,
        cancelId: 0,
        title: "Set up Guardian on this Windows PC",
        message:
          "Continue only on the child's test PC using a separate parent administrator account.",
        detail:
          "Windows will request administrator approval. The local wizard can install Guardian or recover/remove it. Installing the Home app alone does not protect this PC. Keep existing parental controls enabled.",
      });
      if (consent.response !== 1)
        return "Cancelled. No administrator setup was started.";
      const invocation = setupInvocation(
        variant,
        process.resourcesPath,
        process.env.SystemRoot || "C:\\Windows",
      );
      await fs.access(invocation.script);
      await promisify(execFile)(invocation.executable, invocation.args, {
        timeout: 20 * 60 * 1000,
        windowsHide: true,
        maxBuffer: 8192,
      });
      return "Administrator wizard finished. This is not a protection check; verify the child account, service and both browser policies.";
    } catch {
      return "Setup did not report successful completion. Check the administrator window. Admin Permissions is needed; cancellation or a missing prerequisite does not enable protection.";
    } finally {
      setupRunning = false;
    }
  }),
);
ipcMain.handle(
  "guardian-guide",
  authorized(() =>
    shell.openPath(
      path.join(process.resourcesPath, "guardian", "Setup-Instructions.txt"),
    ),
  ),
);
ipcMain.handle(
  "kids-vault",
  authorized(async (operation, token) => {
    if (variant !== "kids") throw Error("Kids enrollment only.");
    if (operation === "clear") {
      await fs.rm(stored(), { force: true });
      return {};
    }
    if (!safeStorage.isEncryptionAvailable())
      throw Error("Windows encrypted storage is unavailable.");
    if (operation === "read") {
      try {
        return {
          token: safeStorage.decryptString(await fs.readFile(stored())),
        };
      } catch {
        return { token: "" };
      }
    }
    if (
      operation !== "write" ||
      typeof token !== "string" ||
      !/^[-_A-Za-z0-9]{43}$/.test(token)
    )
      throw Error("Invalid enrollment.");
    await fs.mkdir(app.getPath("userData"), { recursive: true });
    await fs.writeFile(stored(), safeStorage.encryptString(token), {
      mode: 0o600,
    });
    return {};
  }),
);
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  session.defaultSession.webRequest.onHeadersReceived((details, callback) =>
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'",
        ],
      },
    }),
  );
  main = new BrowserWindow({
    width: variant === "kids" ? 720 : 1250,
    height: 900,
    minWidth: 390,
    minHeight: 600,
    title: variant === "kids" ? "Bluey for Kids" : "Bluey Home",
    icon: path.join(__dirname, "..", "dist", `bluey-${variant}-logo.png`),
    backgroundColor: "#f7f9fc",
    webPreferences: {
      preload: path.join(__dirname, "family-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  main.webContents.on("will-navigate", (event) => event.preventDefault());
  main.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  main.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
});
// Closing a companion never calls StopService, clears rules or changes allowance.
app.on("window-all-closed", () => app.quit());
