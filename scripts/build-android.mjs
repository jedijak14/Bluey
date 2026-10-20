import { spawnSync } from "node:child_process";
const windows = process.platform === "win32";
const result = spawnSync(
  windows ? "gradlew.bat" : "./gradlew",
  ["assembleDebug", "--no-daemon"],
  { cwd: "android", stdio: "inherit", shell: windows },
);
if (result.error)
  console.error(
    "Android build needs Java 21 and Android SDK 35. See README.md.",
    result.error.message,
  );
process.exit(result.status ?? 1);
