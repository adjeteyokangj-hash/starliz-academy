import { LearningError } from "./state-machine";

export async function readActivityBody(request: Request, timeoutMs = 10000): Promise<unknown> {
  const declared = request.headers.get("content-length");
  const maximum = 192 * 1024;
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maximum)) throw new LearningError("This workspace request is too large.", 413);
  if (!request.body) throw new LearningError("Choose an activity action.");
  const reader = request.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0, text = "", timedOut = false, complete = false;
  const timer = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, timeoutMs);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) { complete = true; break; }
      bytes += value.byteLength;
      if (bytes > maximum) throw new LearningError("This workspace request is too large.", 413);
      text += decoder.decode(value, { stream: true });
    }
    if (timedOut) throw new LearningError("The activity upload timed out. Your previous saved work remains safe; retry the request.", 408);
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    if (timedOut) throw new LearningError("The activity upload timed out. Your previous saved work remains safe; retry the request.", 408);
    if (error instanceof LearningError) throw error;
    throw new LearningError("Send a valid UTF-8 activity request.");
  } finally { clearTimeout(timer); if (!complete) void reader.cancel().catch(() => {}); reader.releaseLock(); }
}
