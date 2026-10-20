// Run directly with node --test; no Electron process or privileged OS effects.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  validateRequest,
  guardianStatus,
} = require("../electron/family-bridge.cjs");
test("Kids bridge cannot reach parent, policy or agent routes", () => {
  for (const path of [
    "auth/login",
    "dashboard",
    "agent/policy",
    "children",
    "../auth/login",
    "kid?role=parent",
  ])
    assert.throws(() => validateRequest("kids", path, "", {}, "POST"));
  validateRequest("kids", "enroll", "", { code: "test" }, "POST");
  validateRequest("kids", "kid", "kid-token", undefined, "GET");
  assert.throws(() => validateRequest("kids", "kid", "", {}, "POST"));
  assert.throws(() =>
    validateRequest("kids", "enroll", "", { code: "x".repeat(21000) }, "POST"),
  );
});
test("status requires fresh report bound to current Windows user and never attests safety", () => {
  assert.equal(guardianStatus(null, "child").state, "admin_needed");
  const record = {
    child_sid: "child",
    updated_at: 100,
    edge_rules: true,
    applied_version: 1,
  };
  assert.equal(guardianStatus(record, "parent", 101).state, "wrong_account");
  assert.equal(guardianStatus(record, "child", 111).state, "unavailable");
  assert.equal(guardianStatus(record, "child", 90).state, "unavailable");
  assert.equal(
    guardianStatus({ ...record, edge_rules: false }, "child", 101).state,
    "attention",
  );
  assert.equal(guardianStatus(record, "child", 101).state, "reporting");
  assert.equal(guardianStatus(record, "child", 101).verified, false);
});
