import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";

test("next-step endpoint enforces learner scope, mastery and publication before recommending content", async () => {
  const fixture = {
    access: { child: { id: "fictional-owned-child" }, response: null as Response | null },
    rows: [{ lessonId: "understanding-loops", skillStatus: "mastered" }],
    progress: [{ id: "draft", inventoryId: "Y1.01", year: 1, title: "QA draft", status: "not_started", unlocked: true }],
    released: [] as string[], query: null as unknown, booking: null as unknown, progressReads: 0,
  };
  const holder = globalThis as typeof globalThis & { __codingNextRouteFixture?: typeof fixture };
  holder.__codingNextRouteFixture = fixture;
  const sources: Record<string, string> = {
    "@/lib/db": "export const prisma={codingWorkspace:{findMany:async query=>{globalThis.__codingNextRouteFixture.query=query;return globalThis.__codingNextRouteFixture.rows}}};",
    "@/lib/coding/student-context": "export async function requireCodingLearner(context){globalThis.__codingNextRouteFixture.booking=context;return globalThis.__codingNextRouteFixture.access}",
    "@/lib/coding/catalog": "export function publishedCodingLessons(){return [{id:'understanding-loops',title:'Understanding Loops'}]}",
    "@/lib/coding/learning/catalogue": "export function releasedActivities(){return globalThis.__codingNextRouteFixture.released.map(id=>({id}))}",
    "@/lib/coding/learning/workspace-store": "export async function codingActivityProgress(child){if(child!=='fictional-owned-child')throw Error('wrong learner');globalThis.__codingNextRouteFixture.progressReads++;return globalThis.__codingNextRouteFixture.progress}",
  };
  try {
    const built = await build({ entryPoints: ["src/app/api/student/coding/next/route.ts"], bundle: true, platform: "node", format: "cjs", packages: "external", write: false, plugins: [{ name: "fictional-route-boundaries", setup(api) {
      api.onResolve({ filter: /^@\/lib\// }, args => sources[args.path] ? { path: args.path, namespace: "fictional" } : undefined);
      api.onLoad({ filter: /.*/, namespace: "fictional" }, args => ({ contents: sources[args.path]!, loader: "js" }));
    } }] });
    const handlerModule = { exports: {} as { GET: (request: Request) => Promise<Response> } };
    // Compile trusted repository handler code, never a learner program.
    new Function("require", "module", "exports", built.outputFiles[0]!.text)(createRequire(import.meta.url), handlerModule, handlerModule.exports);
    const request = () => new Request("http://localhost/api/student/coding/next?completedLessonId=understanding-loops&bookingId=fictional-booking");
    let response = await handlerModule.exports.GET(request());
    assert.deepEqual(await response.json(), { state: "caught-up" }, "Visible QA drafts cannot become next activities");
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.deepEqual(fixture.query, { where: { childId: "fictional-owned-child", lessonId: { in: ["understanding-loops"] } }, select: { lessonId: true, skillStatus: true } });
    assert.deepEqual(fixture.booking, { bookingId: "fictional-booking" });
    fixture.released = ["draft"]; fixture.progress[0]!.unlocked = false;
    response = await handlerModule.exports.GET(request()); assert.deepEqual(await response.json(), { state: "prerequisites" });
    fixture.progress[0]!.unlocked = true;
    response = await handlerModule.exports.GET(request()); assert.deepEqual(await response.json(), { state: "next", activity: { title: "QA draft", href: "/student/coding/activities/draft" } });
    fixture.progress[0]!.status = "mastered";
    response = await handlerModule.exports.GET(new Request("http://localhost/api/student/coding/next?completedLessonId=draft"));
    assert.deepEqual(await response.json(), { state: "caught-up" }, "Completed expanded activity is excluded and legacy content is not recommended backwards");
    fixture.progress[0]!.status = "practising";
    response = await handlerModule.exports.GET(new Request("http://localhost/api/student/coding/next?completedLessonId=draft"));
    assert.equal(response.status, 409, "Expanded completion requires the current learner's recorded mastery");
    const reads = fixture.progressReads;
    fixture.rows[0]!.skillStatus = "practising";
    response = await handlerModule.exports.GET(request()); assert.equal(response.status, 409); assert.equal(fixture.progressReads, reads);
    fixture.query = null;
    response = await handlerModule.exports.GET(new Request("http://localhost/api/student/coding/next?completedLessonId=unpublished")); assert.equal(response.status, 404); assert.equal(fixture.query, null);
    fixture.access = { child: null as unknown as typeof fixture.access.child, response: new Response("Coding access required", { status: 402 }) };
    response = await handlerModule.exports.GET(request()); assert.equal(response.status, 402); assert.equal(fixture.query, null);
  } finally { delete holder.__codingNextRouteFixture; }
});
