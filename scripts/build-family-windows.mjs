import { spawnSync } from "node:child_process";
import fs from "node:fs";
const variant = process.argv[2];
if (!["kids", "home"].includes(variant)) throw Error("Choose kids or home.");
const name = variant === "kids" ? "Bluey for Kids" : "Bluey Home";
const config = {
  extends: "./package.json",
  appId: `app.bluey.${variant}.desktop`,
  productName: name,
  extraMetadata: { main: "electron/family-main.cjs", blueyVariant: variant },
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    requestedExecutionLevel: "asInvoker",
    icon: "electron/assets/icon.ico",
  },
  nsis: {
    oneClick: false,
    perMachine: true,
    allowElevation: true,
    allowToChangeInstallationDirectory: false,
    artifactName: `Bluey-${variant === "kids" ? "Kids" : "Home"}-\${version}-Windows-\${arch}-Setup.\${ext}`,
  },
  directories: { output: `release/${variant}` },
  extraResources: [
    { from: "guardian/README.md", to: "guardian/Setup-Instructions.txt" },
    { from: "backend", to: "backend", filter: ["*.py", "*.txt"] },
    {
      from: "guardian",
      to: "guardian",
      filter: ["*.ps1", "*.py", "*.md", "*.txt"],
    },
  ],
};
// electron-builder's configuration extends should be a builder config, not a
// package manifest. Merge the repository's base builder configuration explicitly.
const base = JSON.parse(fs.readFileSync("package.json")).build;
delete config.extends;
fs.mkdirSync("artifacts", { recursive: true });
const configPath = `artifacts/windows-${variant}.json`;
fs.writeFileSync(configPath, JSON.stringify({ ...base, ...config }));
const env = { ...process.env, VITE_BLUEY_VARIANT: variant };
for (const args of [
  ["run", "build"],
  [
    "exec",
    "--",
    "electron-builder",
    "--config",
    configPath,
    "--win",
    "nsis",
    "--x64",
    "--publish",
    "never",
  ],
]) {
  const r = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", args, {
    stdio: "inherit",
    env,
    shell: process.platform === "win32",
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
