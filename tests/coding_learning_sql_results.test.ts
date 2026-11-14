import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SqlExecution from "../src/components/coding/SqlExecution";

test("actual SQL tables distinguish zero, missing and empty results and escape untrusted cells", () => {
  const html = renderToStaticMarkup(createElement(SqlExecution, { results: [{ columns: ["amount", "note"], rows: [[0, null], [2, "<script>throw 1</script>"]] }, { columns: ["id"], rows: [] }] }));
  assert.match(html, />0<\/td>/); assert.match(html, /SQL NULL, missing value/); assert.match(html, /No matching rows/);
  assert.match(html, /&lt;script&gt;throw 1&lt;\/script&gt;/); assert.doesNotMatch(html, /<script>/);
  assert.match(html, /tabindex="0"/); assert.match(html, /scope="col"/);
});
test("malformed SQL rows cannot be silently presented under mismatched headers", () => {
  const html = renderToStaticMarkup(createElement(SqlExecution, { results: [{ columns: ["id", "title"], rows: [["wrong-width"]] }] }));
  assert.match(html, /role="alert"/); assert.match(html, /unsupported table/); assert.doesNotMatch(html, /<table/);
});
