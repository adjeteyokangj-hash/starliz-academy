// Preloaded only in the owned development acceptance app. No private QA
// request may leave through fetch; local app/runner traffic remains real.
if (process.env.NODE_ENV === "development" && process.env.CODING_QA_DISABLE_LIVE_MODEL === "true") {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, options) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
      const error = new Error("External HTTP is disabled in this owned QA app; no payload was sent.");
      error.name = "CodingQaEgressBlocked";
      throw error;
    }
    return original(input, options);
  };
}
