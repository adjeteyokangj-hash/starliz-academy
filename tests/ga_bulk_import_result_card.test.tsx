import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import GaBulkImportResultCard from "../src/components/admin/GaBulkImportResultCard";

test("Ga bulk import result card renders success summary", () => {
  const html = renderToStaticMarkup(
    React.createElement(GaBulkImportResultCard, {
      summary: {
        totalRows: 102,
        importedRows: 96,
        skippedDuplicateRows: 4,
        updatedDuplicateRows: 0,
        failedRows: 2,
        pendingReviewRows: 11,
        sourceName: "NEW GA WORDS 1",
      },
      duplicateStrategy: "skip",
    }),
  );

  assert.match(html, /Import complete/i);
  assert.match(html, /Total rows processed:[\s\S]*102/i);
  assert.match(html, /Imported rows:[\s\S]*96/i);
  assert.match(html, /Skipped duplicates:[\s\S]*4/i);
  assert.match(html, /Failed rows:[\s\S]*2/i);
  assert.match(html, /Pending\/Review rows:[\s\S]*11/i);
  assert.match(html, /Source:[\s\S]*NEW GA WORDS 1/i);
});

test("Ga bulk import result card shows updated duplicates only for update strategy", () => {
  const html = renderToStaticMarkup(
    React.createElement(GaBulkImportResultCard, {
      summary: {
        totalRows: 20,
        importedRows: 10,
        skippedDuplicateRows: 0,
        updatedDuplicateRows: 10,
        failedRows: 0,
        pendingReviewRows: 0,
        sourceName: null,
      },
      duplicateStrategy: "update",
    }),
  );

  assert.match(html, /Updated duplicates:[\s\S]*10/i);
});
