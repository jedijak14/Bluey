import { spawnSync } from "node:child_process";
import fs from "node:fs";
const variant = process.argv[2];
if (!["home", "kids"].includes(variant))
  throw new Error(
    "Usage: node scripts/build-family-android.mjs home|kids [--sync-only]",
  );
const env = {
  ...process.env,
  BLUEY_VARIANT: variant,
  VITE_BLUEY_VARIANT: variant,
};
for (const args of [
  ["run", "android:sync"],
  ...(process.argv.includes("--sync-only")
    ? []
    : [["exec", "--", "node", "scripts/build-android.mjs"]]),
]) {
  const r = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", args, {
    stdio: "inherit",
    env,
    shell: process.platform === "win32",
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
if (!process.argv.includes("--sync-only")) {
  fs.mkdirSync("release/family", { recursive: true });
  fs.copyFileSync(
    "android/app/build/outputs/apk/debug/app-debug.apk",
    `release/family/Bluey-${variant === "home" ? "Home" : "Kids"}-0.5.3-Android.apk`,
  );
}
