import { chromium } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const drawings = {
  bridge: { creator: "StarLiz Bridge Illustration Team", alt: "An arched bridge crosses a blue river between two green banks.", shapes: '<rect width="240" height="120" fill="#e0f2fe"/><circle cx="207" cy="24" r="12" fill="#fbbf24"/><path d="M0 83Q50 70 95 86T240 82V120H0Z" fill="#0284c7"/><path d="M0 68H40L57 87H0ZM240 68H200L183 87H240Z" fill="#15803d"/><path d="M40 82Q120 0 200 82L184 82Q120 27 56 82Z" fill="#a16207"/><path d="M40 58H200V70H40Z" fill="#92400e"/><path d="M60 58V40M90 58V23M120 58V18M150 58V23M180 58V40" stroke="#78350f" stroke-width="5"/><path d="M27 101H70M98 105H145M170 100H215" stroke="#bae6fd" stroke-width="4" stroke-linecap="round"/>' },
  museum: { creator: "StarLiz Museum Illustration Team", alt: "A museum has a triangular roof, three columns and a clearly marked entrance.", shapes: '<rect width="240" height="120" fill="#fef3c7"/><rect x="0" y="99" width="240" height="21" fill="#a7f3d0"/><path d="M43 36L120 7L197 36Z" fill="#6d28d9"/><rect x="43" y="36" width="154" height="10" rx="3" fill="#5b21b6"/><path d="M60 46H78V94H60ZM111 46H129V94H111ZM162 46H180V94H162Z" fill="#c4b5fd"/><rect x="89" y="57" width="15" height="37" fill="#334155"/><rect x="137" y="57" width="15" height="37" fill="#334155"/><path d="M36 94H204V103H36ZM28 103H212V111H28Z" fill="#7c3aed"/><circle cx="120" cy="27" r="7" fill="#fde68a"/>' },
  garden: { creator: "StarLiz Garden Illustration Team", alt: "A flowering plant grows from soil while a watering can supplies drops beside it.", shapes: '<rect width="240" height="120" fill="#ecfccb"/><path d="M0 93Q60 78 120 94T240 91V120H0Z" fill="#854d0e"/><path d="M82 93V44M82 77Q52 48 50 70Q58 86 82 83M82 66Q111 39 115 60Q108 78 82 75" stroke="#15803d" stroke-width="5" fill="#4ade80"/><g fill="#f472b6"><circle cx="82" cy="28" r="13"/><circle cx="67" cy="41" r="13"/><circle cx="96" cy="41" r="13"/><circle cx="74" cy="53" r="13"/><circle cx="91" cy="53" r="13"/></g><circle cx="82" cy="41" r="12" fill="#facc15"/><path d="M161 51H205V84Q184 99 161 84Z" fill="#0369a1"/><path d="M202 52Q230 48 222 70L205 75M161 57L139 45L132 52L160 73" stroke="#0369a1" stroke-width="7" fill="none"/><path d="M130 60L126 67M140 65L136 73M147 73L143 81" stroke="#38bdf8" stroke-width="4" stroke-linecap="round"/>' },
};
async function main() {
  const directory = `artifacts/coding-assets/web-guides-${randomUUID()}`; mkdirSync(directory, { recursive: true });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const assets: Record<string, { uri: string; hash: string; creator: string; alt: string; licence: string }> = {};
  try {
    const page = await browser.newPage({ viewport: { width: 240, height: 120 }, deviceScaleFactor: 2 });
    for (const [name, drawing] of Object.entries(drawings)) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120" role="img"><title>${drawing.alt}</title>${drawing.shapes}</svg>`;
      writeFileSync(`${directory}/${name}.svg`, svg, { flag: "wx" });
      await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
      const png = await page.locator("svg").screenshot({ type: "png" });
      writeFileSync(`${directory}/${name}.png`, png, { flag: "wx" });
      const uri = `data:image/png;base64,${png.toString("base64")}`;
      if (uri.length > 18000) throw new Error("The original illustration exceeds the reviewed inline-media size.");
      assets[name] = { uri, hash: createHash("sha256").update(uri).digest("hex"), creator: drawing.creator, alt: drawing.alt, licence: "original" };
    }
    writeFileSync("src/lib/coding/learning/content/web-guide-assets.ts", `// Original StarLiz vector illustrations rasterised by the reviewed asset script.\nexport const webGuideAssets = ${JSON.stringify(assets, null, 2)} as const;\n`, { flag: "wx" });
    writeFileSync(`${directory}/provenance.json`, JSON.stringify({ originalStarLizArtwork: true, externallySourcedMedia: false, assets: Object.fromEntries(Object.entries(assets).map(([name, asset]) => [name, { creator: asset.creator, alt: asset.alt, licence: asset.licence, hash: asset.hash }])) }, null, 2), { flag: "wx" });
    console.log(JSON.stringify({ directory, generatedOriginalAssets: Object.keys(assets), existingFilesOverwritten: false }));
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Original web-guide asset generation failed."); process.exitCode = 1; });
