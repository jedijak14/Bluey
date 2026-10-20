/** Browser/native Home gateway. End-user tokens stay end-user scoped; gateway secret is server-only. */
const routes = [
  [/^status$/, ["GET"]],
  [/^children\/[a-f0-9-]{36}\/agent-enrollment$/, ["POST"]],
  [/^agent\/enroll$/, ["POST"]],
  [/^agent\/policy$/, ["GET"]],
  [/^agent\/(report|events)$/, ["POST"]],
  [/^alerts$/, ["GET"]],
  [/^alerts\/[a-f0-9-]{36}\/seen$/, ["POST"]],
  [/^auth\/(register|login|logout)$/, ["POST"]],
  [/^dashboard$/, ["GET"]],
  [/^children$/, ["POST"]],
  [/^children\/[a-f0-9-]{36}$/, ["DELETE"]],
  [/^children\/[a-f0-9-]{36}\/policy$/, ["PUT"]],
  [/^children\/[a-f0-9-]{36}\/enrollment$/, ["POST"]],
  [/^enroll$/, ["POST"]],
  [/^kid$/, ["GET"]],
  [/^kid\/requests$/, ["POST"]],
  [/^requests\/[a-f0-9-]{36}\/decision$/, ["POST"]],
];
export async function familyProxy(
  req,
  res,
  env = process.env,
  fetcher = fetch,
) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const send = (code, body) => {
    res.statusCode = code;
    res.end(JSON.stringify(body));
  };
  const origin = req.headers.origin;
  if (origin) {
    try {
      const allowed =
        new URL(origin).host === req.headers.host ||
        (env.BLUEY_FAMILY_NATIVE_ORIGIN || "https://localhost") === origin;
      if (!allowed)
        return send(403, { error: "This origin is not permitted." });
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type",
      );
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
    } catch {
      return send(403, { error: "Invalid origin." });
    }
  }
  const path = new URL(req.url, "https://bluey.invalid").pathname.replace(
    /^\/api\/family\//,
    "",
  );
  const route = routes.find(([pattern]) => pattern.test(path));
  if (!route) return send(404, { error: "Not found." });
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (!route[1].includes(req.method))
    return send(405, { error: "Method not allowed." });
  const target = env.BLUEY_FAMILY_SERVICE_URL,
    secret = env.BLUEY_FAMILY_GATEWAY_TOKEN;
  if (!target || !secret)
    return send(
      path === "status" ? 200 : 503,
      path === "status"
        ? {
            status: "unavailable",
            enforcement_available: false,
            notifications: "unavailable",
          }
        : {
            error:
              "The remote Bluey Home service has not been connected. No child device is protected.",
          },
    );
  let base;
  try {
    base = new URL(target);
    const local =
      env.NODE_ENV !== "production" &&
      base.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(base.hostname);
    if (
      (!local && base.protocol !== "https:") ||
      base.username ||
      base.password ||
      base.pathname !== "/" ||
      base.search ||
      base.hash
    )
      throw Error();
  } catch {
    return send(503, { error: "Family service configuration is invalid." });
  }
  let body;
  if (["POST", "PUT"].includes(req.method)) {
    try {
      let raw = req.body;
      if (raw === undefined) {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += Buffer.byteLength(chunk);
          if (size > 20000) throw Error();
          chunks.push(Buffer.from(chunk));
        }
        raw = Buffer.concat(chunks).toString("utf8");
      }
      body = typeof raw === "string" ? raw : JSON.stringify(raw ?? {});
      if (Buffer.byteLength(body) > 20000) throw Error();
      JSON.parse(body);
    } catch {
      return send(400, { error: "Invalid or oversized request." });
    }
  }
  try {
    const upstream = await fetcher(new URL("/api/family/" + path, base), {
      method: req.method,
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      headers: {
        "Content-Type": "application/json",
        "X-Bluey-Gateway": secret,
        Authorization: String(req.headers.authorization || "").slice(0, 210),
      },
      body,
    });
    const text = await upstream.text();
    if (text.length > 200000) throw Error();
    const data = JSON.parse(text);
    if (!upstream.ok) {
      const detail =
        typeof data.detail === "string"
          ? data.detail
          : "The family service rejected this request.";
      return send(
        [400, 401, 403, 404, 409, 422, 429].includes(upstream.status)
          ? upstream.status
          : 503,
        { error: detail },
      );
    }
    return send(200, data);
  } catch {
    return send(503, {
      error: "Bluey Home is unavailable. No protection status can be verified.",
    });
  }
}
