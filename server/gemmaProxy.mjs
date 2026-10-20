/** Same-origin website gateway. Only operators configure the upstream; no browser keys. */
export const MODEL_HANDLE = "keras/gemma3/keras/gemma3_1b";
export async function gemmaProxy(req, res, env = process.env, fetcher = fetch) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  const send = (status, body) => {
    res.statusCode = status;
    res.end(JSON.stringify(body));
  };
  const path = new URL(req.url, "https://bluey.invalid").pathname;
  const isStatus = path === "/api/gemma/status";
  if (!isStatus && path !== "/api/gemma/generate")
    return send(404, { error: "Not found" });
  if (req.method !== (isStatus ? "GET" : "POST"))
    return send(405, { error: "Method not allowed" });
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (origin) {
    try {
      if (new URL(origin).host !== host)
        return send(403, { error: "Cross-origin requests are not permitted" });
    } catch {
      return send(403, { error: "Invalid origin" });
    }
  }
  // Compatibility hint only; device checks are not authentication or attestation.
  if (
    /iPhone|iPad|iPod|Android|Tablet|Windows Phone|Kindle|Silk/i.test(
      req.headers["user-agent"] || "",
    )
  )
    return send(403, { error: "Desktop browsers only" });
  const target = env.BLUEY_GEMMA_SERVICE_URL;
  const secret = env.BLUEY_GEMMA_SERVICE_TOKEN;
  if (!target || !secret)
    return send(
      isStatus ? 200 : 503,
      isStatus
        ? {
            status: "unavailable",
            model: MODEL_HANDLE,
            kind: "pretrained_base",
          }
        : { error: "The Gemma inference service is not connected yet." },
    );
  let base;
  try {
    base = new URL(target);
    const localDev =
      env.NODE_ENV !== "production" &&
      base.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(base.hostname);
    if (
      (!localDev && base.protocol !== "https:") ||
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      base.pathname !== "/"
    )
      throw new Error();
  } catch {
    return send(503, { error: "Inference service configuration is invalid." });
  }
  let body;
  if (!isStatus) {
    try {
      let raw = req.body;
      if (raw === undefined) {
        let size = 0;
        const chunks = [];
        for await (const chunk of req) {
          size += Buffer.byteLength(chunk);
          if (size > 8192) throw new Error();
          chunks.push(Buffer.from(chunk));
        }
        raw = Buffer.concat(chunks).toString("utf8");
      }
      if (typeof raw === "string") {
        if (Buffer.byteLength(raw) > 8192) throw new Error();
        raw = JSON.parse(raw);
      }
      if (
        !raw ||
        typeof raw.text !== "string" ||
        !raw.text.trim() ||
        raw.text.length > 1200 ||
        Object.keys(raw).some((k) => !["text", "max_new_tokens"].includes(k))
      )
        throw new Error();
      const tokens = raw.max_new_tokens ?? 128;
      if (!Number.isInteger(tokens) || tokens < 16 || tokens > 192)
        throw new Error();
      body = JSON.stringify({ text: raw.text.trim(), max_new_tokens: tokens });
    } catch {
      return send(400, {
        error:
          "Use a short prompt (up to 1200 characters) and 16–192 output tokens.",
      });
    }
  }
  try {
    const response = await fetcher(new URL(path, base), {
      method: req.method,
      redirect: "error",
      signal: AbortSignal.timeout(isStatus ? 8000 : 90000),
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body,
    });
    if (!response.ok)
      return send(
        [400, 429, 504].includes(response.status) ? response.status : 503,
        {
          error:
            response.status === 429
              ? "Gemma is busy or rate-limited. Try again shortly."
              : "The inference service could not complete this request.",
        },
      );
    const text = await response.text();
    if (text.length > 30000) throw new Error();
    const data = JSON.parse(text);
    if (data.model !== MODEL_HANDLE) throw new Error();
    if (
      isStatus &&
      ["ready", "loading", "unavailable", "error"].includes(data.status)
    )
      return send(200, {
        status: data.status,
        model: MODEL_HANDLE,
        kind: "pretrained_base",
        busy: Boolean(data.busy),
      });
    if (
      !isStatus &&
      typeof data.text === "string" &&
      data.text.trim() &&
      data.text.length <= 12000
    )
      return send(200, {
        text: data.text,
        model: MODEL_HANDLE,
        kind: "base_model_completion",
      });
    throw new Error();
  } catch {
    return send(503, {
      error:
        "The inference service is unreachable or returned an invalid response.",
    });
  }
}
