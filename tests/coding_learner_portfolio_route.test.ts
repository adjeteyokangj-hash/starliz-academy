import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";

test("learner portfolio keeps both project types behind the active learner boundary", async () => {
  const fixture = { allowed: true, childrenRead: [] as string[] };
  const holder = globalThis as typeof globalThis & { __codingPortfolioFixture?: typeof fixture }; holder.__codingPortfolioFixture = fixture;
  const sources: Record<string, string> = {
    "@/lib/coding/student-context": "export async function requireCodingLearner(){return globalThis.__codingPortfolioFixture.allowed?{child:{id:'fictional-owner'}}:{child:null,response:new Response('Access required',{status:402})}}",
    "@/lib/api_guard": "export function checkRateLimit(){return {allowed:true}}",
    "@/lib/coding/learning/parent-portfolio": "export async function parentActivityPortfolio(child){globalThis.__codingPortfolioFixture.childrenRead.push(child);return [{id:'fictional-expanded'}]} export async function parentActivityProject(){return null}",
    "@/lib/coding/workspace-store": "export async function learnerLegacyProjects(child){globalThis.__codingPortfolioFixture.childrenRead.push(child);return [{lessonId:'understanding-loops',title:'Understanding Loops',preview:{evidenceStatus:'assessed-version'}}]}",
  };
  try {
    const built = await build({ entryPoints: ["src/app/api/student/coding/portfolio/route.ts"], bundle: true, platform: "node", format: "cjs", packages: "external", write: false, plugins: [{ name: "fictional-portfolio-boundaries", setup(api) {
      api.onResolve({ filter: /^@\/lib\// }, args => sources[args.path] ? { path: args.path, namespace: "fictional" } : undefined);
      api.onLoad({ filter: /.*/, namespace: "fictional" }, args => ({ contents: sources[args.path]!, loader: "js" }));
    } }] });
    const handlerModule = { exports: {} as { GET: (request: Request) => Promise<Response> } };
    // Trusted repository handler; no learner program is compiled here.
    new Function("require", "module", "exports", built.outputFiles[0]!.text)(createRequire(import.meta.url), handlerModule, handlerModule.exports);
    const endpoint = "http://localhost/api/student/coding/portfolio";
    let response = await handlerModule.exports.GET(new Request(endpoint));
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.equal(result.projects.length, 1); assert.equal(result.legacyProjects[0].lessonId, "understanding-loops");
    assert.deepEqual(fixture.childrenRead, ["fictional-owner", "fictional-owner"]);
    fixture.childrenRead = [];
    response = await handlerModule.exports.GET(new Request(`${endpoint}?studentId=another-child`));
    assert.equal(response.status, 400); assert.deepEqual(fixture.childrenRead, []);
    fixture.allowed = false;
    response = await handlerModule.exports.GET(new Request(endpoint));
    assert.equal(response.status, 402); assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.deepEqual(fixture.childrenRead, []);
  } finally { delete holder.__codingPortfolioFixture; }
});
