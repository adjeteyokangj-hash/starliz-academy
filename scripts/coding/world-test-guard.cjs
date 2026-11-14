/* eslint-disable @typescript-eslint/no-require-imports -- Synchronous CommonJS preload runs before application ESM imports. */
// Loaded before Next, Prisma, dotenv and test imports. Dedicated local QA only.
const fs = require('node:fs');
const net = require('node:net');
const tls = require('node:tls');
const dns = require('node:dns');
const dgram = require('node:dgram');
const { syncBuiltinESMExports } = require('node:module');
function assertTarget(raw) {
  let u; try { u = new URL(raw); } catch { throw Error('WORLD_QA_INVALID_DATABASE'); }
  if (!['postgresql:', 'postgres:'].includes(u.protocol) || u.hostname !== '127.0.0.1' || u.port !== '55432' || u.pathname !== '/starliz_game_world_test' || u.searchParams.get('sslmode') !== 'disable') throw Error('WORLD_QA_WRONG_DATABASE_STOP');
  for (const key of u.searchParams.keys()) if (!['sslmode','connection_limit','pool_timeout','schema'].includes(key)) throw Error('WORLD_QA_DATABASE_OPTION_BLOCKED');
  return true;
}
module.exports = { assertTarget };
if (process.env.STARLIZ_WORLD_DB_QA === '1') {
  const {redact}=require('./qa-redaction.cjs');
  const {format}=require('node:util');
  for(const method of ['log','error','warn','info','debug']) {
    const original=console[method].bind(console);
    console[method]=(...values)=>original(redact(format(...values)));
  }
  assertTarget(process.env.DATABASE_URL);
  assertTarget(process.env.DIRECT_URL);
  if (process.env.DIRECT_URL !== process.env.DATABASE_URL) throw Error('WORLD_QA_DATABASE_MISMATCH');
  process.env.__NEXT_PROCESSED_ENV = 'true';
  const blocked = () => { const e = Error('WORLD_QA_EXTERNAL_NETWORK_BLOCKED'); e.code = 'WORLD_QA_EGRESS'; throw e; };
  const local = host => ['127.0.0.1','localhost','::1','[::1]'].includes(String(host));
  const originalConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    const a = Array.isArray(args[0]) ? args[0] : args;
    const opts = a[0];
    if (opts && typeof opts === 'object') { if (opts.path || !local(opts.host ?? 'localhost')) blocked(); }
    else if (typeof opts === 'number' || /^\d+$/.test(String(opts))) { if (!local(typeof a[1] === 'string' ? a[1] : 'localhost')) blocked(); }
    else blocked();
    return originalConnect.apply(this, args);
  };
  const originalTls = tls.connect;
  tls.connect = function (...args) { const a = args[0]; if (typeof a === 'object' ? !local(a.host ?? a.servername ?? 'localhost') : !local(typeof args[1] === 'string' ? args[1] : 'localhost')) blocked(); return originalTls.apply(this,args); };
  dgram.createSocket = blocked;
  const lookup = dns.lookup;
  dns.lookup = function (host,...args) { if (!local(host)) blocked(); return lookup.call(this,host,...args); };
  const promiseLookup = dns.promises.lookup.bind(dns.promises);
  dns.promises.lookup = async (host,...args) => { if (!local(host)) blocked(); return promiseLookup(host,...args); };
  for (const key of Object.keys(dns)) if (key.startsWith('resolve') || key === 'reverse') dns[key] = blocked;
  for (const key of Object.keys(dns.promises)) if (key.startsWith('resolve') || key === 'reverse') dns.promises[key] = async () => blocked();
  const fetch = globalThis.fetch;
  globalThis.fetch = (input, options) => { const u = new URL(typeof input === 'string' || input instanceof URL ? input : input.url); if (!local(u.hostname)) return Promise.reject(Error('WORLD_QA_EXTERNAL_FETCH_BLOCKED')); return fetch(input,options); };
  // Next and dotenv cannot load production credentials from any .env variant.
  const envFile = path => /(^|[\\/])\.env(?:\.[^\\/]*)?$/.test(String(path));
  const read = fs.readFileSync;
  fs.readFileSync = function (path, options) { if (envFile(path)) return typeof options === 'string' || options?.encoding ? '' : Buffer.alloc(0); return read.call(this,path,options); };
  const readAsync = fs.readFile;
  fs.readFile = function(path,...args) { if (!envFile(path)) return readAsync.call(this,path,...args); const cb=args.at(-1); queueMicrotask(()=>cb(null,typeof args[0] === 'string' || args[0]?.encoding ? '' : Buffer.alloc(0))); };
  const readPromise = fs.promises.readFile.bind(fs.promises);
  fs.promises.readFile = async (path,options) => envFile(path) ? (typeof options === 'string' || options?.encoding ? '' : Buffer.alloc(0)) : readPromise(path,options);
  syncBuiltinESMExports();
  if (process.env.WORLD_QA_DIRECTORY) {
    const { monitorEventLoopDelay } = require('node:perf_hooks');
    const lag = monitorEventLoopDelay({ resolution: 50 }); lag.enable();
    const timer=setInterval(()=>{const m=process.memoryUsage();fs.appendFileSync(require('node:path').join(process.env.WORLD_QA_DIRECTORY,'process-observations.ndjson'),JSON.stringify({at:new Date().toISOString(),pid:process.pid,rss:m.rss,heapUsed:m.heapUsed,loopMaxMs:lag.max/1e6})+'\n');lag.reset();},5000);timer.unref();
  }
}
