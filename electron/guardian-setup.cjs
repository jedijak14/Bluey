// Fixed, parent-only UAC entry point. No renderer-provided commands or paths.
const path = require("node:path");
const literal = (value) => "'" + value.replaceAll("'", "''") + "'";
function setupInvocation(variant, resources, system) {
  if (variant !== "home") throw Error("Parent Home app required.");
  if (!path.win32.isAbsolute(resources) || !path.win32.isAbsolute(system))
    throw Error("Absolute installation paths required.");
  const executable = path.win32.join(
    system,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  const script = path.win32.join(resources, "guardian", "Setup-Guardian.ps1");
  const argumentsText = `-NoProfile -ExecutionPolicy RemoteSigned -File "${script}"`;
  return {
    executable,
    script,
    args: [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `$ErrorActionPreference='Stop'; $p=Start-Process -FilePath ${literal(executable)} -Verb RunAs -ArgumentList ${literal(argumentsText)} -PassThru -Wait; exit $p.ExitCode`,
    ],
  };
}
module.exports = { setupInvocation };
