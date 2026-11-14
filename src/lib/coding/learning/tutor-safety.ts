/** Tutor prose is escaped text, never executable markup. Literal coding syntax
 * is allowed; requests for private details and unsafe contact are rejected. */
export function safeTeachingMessage(message: string) {
  const text = message.normalize("NFKC").replace(/[\u200b-\u200d\u2060\uFEFF]/g, "").replace(/[’‘]/g, "'");
  const privateRequest = /\b(?:what(?:'s| is| are)|tell|send|give|share|provide|type|enter|reveal|upload)[a-z\s,'-]{0,40}\b(?:your (?:name|first name|full name|real name|home address|address|phone|mobile|surname|school name|postcode|birthday)|password|api[_ -]?key|access[_ -]?token|secret)\b/i;
  const externalEmail = (text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) ?? []).some((email) => !email.toLowerCase().endsWith(".invalid"));
  const unsafeContact = /\b(?:don't|do not|never) tell (?:your |a )?(?:parents?|guardian|trusted adult)|\bkeep (?:this|our)[a-z\s]{0,30}secret (?:from|between)|\b(?:kill yourself|cut your wrists|hurt yourself)\b/i;
  return text.trim().length > 0 && message.length <= 1500 && !externalEmail && !privateRequest.test(text) && !unsafeContact.test(text)
    && !/https?:|www\.|mailto:|\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|ai|co\.uk|gov|edu)\b/i.test(text);
}
