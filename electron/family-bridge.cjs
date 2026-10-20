// Pure validation shared by the isolated Home/Kids desktop process and tests.
const kidsRoutes = [/^kid$/, /^kid\/requests$/, /^enroll$/];
const homeRoutes = [
  /^status$/,
  /^auth\/(login|register|logout)$/,
  /^dashboard$/,
  /^alerts$/,
  /^alerts\/[a-f0-9-]{36}\/seen$/,
  /^children$/,
  /^children\/[a-f0-9-]{36}(?:\/(?:policy|enrollment|agent-enrollment))?$/,
  /^requests\/[a-f0-9-]{36}\/decision$/,
];
function validateRequest(variant, path, token, body, method) {
  if (
    typeof path !== "string" ||
    !(variant === "kids" ? kidsRoutes : homeRoutes).some((r) => r.test(path))
  )
    throw Error("This app cannot access that family route.");
  const expected =
    path === "status" ||
    path === "dashboard" ||
    path === "alerts" ||
    path === "kid"
      ? "GET"
      : /\/policy$/.test(path)
        ? "PUT"
        : /^children\/[a-f0-9-]{36}$/.test(path)
          ? "DELETE"
          : "POST";
  if (
    method !== expected ||
    typeof token !== "string" ||
    token.length > 200 ||
    Buffer.byteLength(JSON.stringify(body ?? {})) > 20000
  )
    throw Error("Invalid family request.");
}
function guardianStatus(record, currentSid, now = Date.now() / 1000) {
  if (!record || typeof record !== "object") return { state: "admin_needed" };
  if (record.child_sid !== currentSid) return { state: "wrong_account" };
  if (
    !Number.isFinite(record.updated_at) ||
    now - record.updated_at > 10 ||
    record.updated_at > now + 5
  )
    return { state: "unavailable" };
  const browserRules =
    record.browser_rules && typeof record.browser_rules === "object"
      ? Object.fromEntries(
          ["edge", "chrome"]
            .filter((name) => Object.hasOwn(record.browser_rules, name))
            .map((name) => [name, record.browser_rules[name] === true]),
        )
      : { edge: record.edge_rules === true };
  return {
    state:
      Object.keys(browserRules).length > 0 &&
      Object.values(browserRules).every(Boolean) &&
      Number.isInteger(record.applied_version)
        ? "reporting"
        : "attention",
    restriction:
      typeof record.restriction === "string"
        ? record.restriction.slice(0, 80)
        : "",
    policyVersion: record.applied_version,
    blocklistVersion: record.blocklist_version,
    browserRules,
    verified: false,
  };
}
module.exports = { validateRequest, guardianStatus };
