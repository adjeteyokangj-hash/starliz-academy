/* Diagnostics must never serialize credentials or raw process arguments. */
function redact(value) {
  return String(value)
    .replace(/((?:--)?[\w-]*(?:secret|token|password|passwd|api[-_]?key|authorization|cookie|database_url|direct_url)[\w-]*\s*(?:[:=]\s*|\s+))("(?:\\.|[^"\\])*"|'[^']*')/gi,'$1"[REDACTED]"')
    .replace(/\b(?:postgres(?:ql)?|redis):\/\/[^\s"'<>]+/gi,'[REDACTED CONNECTION]')
    .replace(/((?:"|')(?:[^"']*(?:secret|token|password|passwd|api[-_]?key|authorization|cookie|database_url|direct_url)[^"']*)(?:"|')\s*:\s*)("(?:\\.|[^"\\])*"|'[^']*')/gi,'$1"[REDACTED]"')
    .replace(/\b((?:proxy-)?authorization|(?:set-)?cookie)\s*:\s*[^\r\n]+/gi,'$1: [REDACTED HEADER]')
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi,'[REDACTED AUTH]')
    .replace(/\b(?:postgres(?:ql)?|https?|redis):\/\/[^\s"'<>]+/gi, raw => {
      try { const url = new URL(raw); if(url.username || url.password) {url.username='REDACTED';url.password='REDACTED';} for(const key of [...url.searchParams.keys()]) url.searchParams.set(key,'REDACTED'); return url.toString(); } catch {return '[REDACTED URL]';}
    })
    .replace(/((?:--)?(?:[\w-]*(?:secret|token|password|passwd|api[-_]?key|authorization|cookie|database_url|direct_url)[\w-]*)["']?\s*(?:[:=]\s*|\s+))["']?[^\s,"'\r\n}]+/gi,'$1[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[REDACTED JWT]')
    .replace(/\b(?:sk-|crsr_)[A-Za-z0-9_-]{12,}/g,'[REDACTED KEY]');
}
function diagnosticLines(write) {
 let pending='',discarding=false;
 return {push(chunk) {
   let text=String(chunk);
   if(discarding) {const end=text.indexOf('\n');if(end===-1)return;text=text.slice(end+1);discarding=false;}
   pending+=text;
   let end;while((end=pending.indexOf('\n'))!==-1) {write(end>65536?'[Oversized diagnostic line omitted]\n':redact(pending.slice(0,end+1)));pending=pending.slice(end+1);}
   if(pending.length>65536) {write('[Oversized diagnostic line omitted]\n');pending='';discarding=true;}
 },flush(){if(pending&&!discarding)write(redact(pending));pending='';}};
}
module.exports={redact,diagnosticLines};
