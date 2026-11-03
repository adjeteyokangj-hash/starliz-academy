import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Compile the real application stylesheet and current source classes without
// requiring an unrelated page's complete development bundle to be resident.
export async function codingComponentStyles() {
  const source = resolve("src/app/globals.css");
  return (await postcss([tailwindcss({ base: resolve("src"), optimize: false })]).process(readFileSync(source, "utf8"), { from: source })).css;
}
