// Filesystem regressions; encryption is a stub, NOT Windows DPAPI certification.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createFamilyVault } = require("../electron/family-vault.cjs");
const first = "a".repeat(43),
  second = "b".repeat(43);
const encryption = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from("cipher:" + value),
  decryptString: (value) => {
    if (!value.toString().startsWith("cipher:"))
      throw Error("invalid ciphertext");
    return value.toString().slice(7);
  },
};
async function fixture(t) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "bluey-vault-test-"));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  return path.join(folder, "enrollment.bin");
}
test("missing enrollment is distinct from unreadable enrollment", async (t) => {
  const filename = await fixture(t),
    vault = createFamilyVault(filename, encryption);
  assert.deepEqual(await vault("read"), { token: "" });
  await fs.writeFile(filename, "corrupt-private-data");
  await assert.rejects(vault("read"), /Saved enrollment could not be read/);
  await fs.writeFile(filename, "x".repeat(16385));
  await assert.rejects(vault("read"), /Saved enrollment could not be read/);
});
test("atomic replacement preserves existing enrollment if rename fails and permits retry", async (t) => {
  const filename = await fixture(t);
  await createFamilyVault(filename, encryption)("write", first);
  let fail = true;
  const io = {
    ...fs,
    rename: async (...args) => {
      if (fail) throw Error("test rename failure");
      return fs.rename(...args);
    },
  };
  const vault = createFamilyVault(filename, encryption, io);
  await assert.rejects(vault("write", second), /rename failure/);
  assert.deepEqual(await vault("read"), { token: first });
  assert.deepEqual(await fs.readdir(path.dirname(filename)), [
    "enrollment.bin",
  ]);
  fail = false;
  await vault("write", second);
  assert.deepEqual(await vault("read"), { token: second });
});
test("clear is serialized after an in-flight save", async (t) => {
  const filename = await fixture(t);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const vault = createFamilyVault(filename, encryption, {
    ...fs,
    writeFile: async (...args) => {
      await gate;
      return fs.writeFile(...args);
    },
  });
  const write = vault("write", first),
    clear = vault("clear");
  release();
  await Promise.all([write, clear]);
  assert.deepEqual(await vault("read"), { token: "" });
});
test("unavailable encryption refuses read/write, but parent-requested clear works", async (t) => {
  const filename = await fixture(t);
  const vault = createFamilyVault(filename, {
    ...encryption,
    isEncryptionAvailable: () => false,
  });
  await assert.rejects(
    vault("write", first),
    /encrypted storage is unavailable/,
  );
  await assert.rejects(vault("read"), /encrypted storage is unavailable/);
  await vault("clear");
  assert.deepEqual(await fs.readdir(path.dirname(filename)), []);
});
test("invalid tokens and operations never touch the vault", async (t) => {
  const filename = await fixture(t),
    vault = createFamilyVault(filename, encryption);
  for (const value of [null, {}, "", "x".repeat(44), "!".repeat(43)])
    await assert.rejects(vault("write", value), /Invalid enrollment/);
  await assert.rejects(vault("unknown", first), /Invalid vault operation/);
  assert.deepEqual(await fs.readdir(path.dirname(filename)), []);
});
