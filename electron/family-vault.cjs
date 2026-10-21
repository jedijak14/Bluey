// Serialized, atomic encrypted Kids enrollment storage. No plaintext fallback.
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

function createFamilyVault(filename, encryption, io = fs) {
  let pending = Promise.resolve();
  const perform = async (operation, token) => {
    if (operation === "clear") {
      await io.rm(filename, { force: true });
      return {};
    }
    if (!["read", "write"].includes(operation))
      throw Error("Invalid vault operation.");
    if (!encryption.isEncryptionAvailable())
      throw Error("Windows encrypted storage is unavailable.");
    if (operation === "read") {
      try {
        if ((await io.stat(filename)).size > 16384)
          throw Error("Invalid vault size.");
        const stored = encryption.decryptString(await io.readFile(filename));
        if (!/^[-_A-Za-z0-9]{43}$/.test(stored))
          throw Error("Invalid stored enrollment.");
        return { token: stored };
      } catch (error) {
        if (error.code === "ENOENT") return { token: "" };
        throw Error(
          "Saved enrollment could not be read from encrypted storage.",
        );
      }
    }
    if (typeof token !== "string" || !/^[-_A-Za-z0-9]{43}$/.test(token))
      throw Error("Invalid enrollment.");
    const ciphertext = encryption.encryptString(token);
    const temporary = filename + "." + randomUUID() + ".tmp";
    await io.mkdir(path.dirname(filename), { recursive: true });
    try {
      await io.writeFile(temporary, ciphertext, { mode: 0o600, flag: "wx" });
      await io.rename(temporary, filename);
    } finally {
      await io.rm(temporary, { force: true }).catch(() => {});
    }
    return {};
  };
  return (operation, token) => {
    const result = pending.then(() => perform(operation, token));
    // A failed operation must not poison retries. Clear cannot race a prior save.
    pending = result.catch(() => {});
    return result;
  };
}
module.exports = { createFamilyVault };
