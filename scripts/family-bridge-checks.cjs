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
test("browser-specific status exposes partial failure and legacy Edge-only coverage", () => {
  const record = {
    child_sid: "child",
    updated_at: 100,
    edge_rules: true,
    applied_version: 1,
  };
  assert.deepEqual(guardianStatus(record, "child", 101).browserRules, {
    edge: true,
  });
  assert.equal(
    guardianStatus(
      { ...record, browser_rules: { edge: true, chrome: false } },
      "child",
      101,
    ).state,
    "attention",
  );
  assert.equal(
    guardianStatus(
      { ...record, browser_rules: { edge: true, chrome: true } },
      "child",
      101,
    ).state,
    "reporting",
  );
  assert.equal(
    guardianStatus({ ...record, browser_rules: {} }, "child", 101).state,
    "attention",
  );
  assert.equal(
    guardianStatus(
      { ...record, browser_rules: { chrome: "true" } },
      "child",
      101,
    ).state,
    "attention",
  );
});
test("administrator launcher is Home-only and uses fixed escaped paths", () => {
  const { setupInvocation } = require("../electron/guardian-setup.cjs");
  assert.throws(() => setupInvocation("kids", "C:\\Bluey", "C:\\Windows"));
  assert.throws(() => setupInvocation("home", "relative", "C:\\Windows"));
  const launch = setupInvocation(
    "home",
    "C:\\Program Files\\Bluey's Home\\resources",
    "C:\\Windows",
  );
  assert.equal(
    launch.script,
    "C:\\Program Files\\Bluey's Home\\resources\\guardian\\Setup-Guardian.ps1",
  );
  assert.match(launch.args.at(-1), /-Verb RunAs/);
  assert.match(launch.args.at(-1), /Bluey''s Home/);
  assert.match(launch.args.at(-1), /RemoteSigned/);
  assert.doesNotMatch(
    launch.args.join(" "),
    /Bypass|Stop-Service|ExecutionPolicy Unrestricted/,
  );
});
test("sign-in policy failures are never reported as healthy browser-only status", () => {
  const record = {
    child_sid: "child",
    updated_at: 100,
    edge_rules: true,
    applied_version: 1,
  };
  for (const state of ["error", "starting", "external_policy"]) {
    const health = guardianStatus(
      { ...record, signin_state: state },
      "child",
      101,
    );
    assert.equal(health.state, "attention");
    assert.equal(health.signInState, state);
  }
  const blocked = guardianStatus(
    { ...record, signin_state: "blocked", native_warning: "failed" },
    "child",
    101,
  );
  assert.equal(blocked.signInState, "blocked");
  assert.equal(blocked.nativeWarning, "failed");
  assert.equal(blocked.verified, false);
  assert.equal(guardianStatus(record, "child", 101).signInState, "disabled");
});
