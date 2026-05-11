import assert from "node:assert/strict";
import test from "node:test";
import { csvEscape } from "../src/lib/csv_escape";

test("csvEscape keeps simple values unchanged", () => {
  assert.equal(csvEscape("hello"), "hello");
  assert.equal(csvEscape(42), "42");
  assert.equal(csvEscape(true), "true");
});

test("csvEscape quotes comma/newline values", () => {
  assert.equal(csvEscape("a,b"), '"a,b"');
  assert.equal(csvEscape("line1\nline2"), '"line1\nline2"');
});

test("csvEscape normalizes CRLF and escapes quotes", () => {
  assert.equal(csvEscape("a\r\nb"), '"a\nb"');
  assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
});
