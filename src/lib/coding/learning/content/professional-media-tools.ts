import { eq, containsText } from "../authoring";
import { inventoryContexts } from "./inventory-service-tools";
import { inventoryWebArtifact, webServiceCases } from "./inventory-web-tools";
import type { Json } from "../types";
export function demonstrationArtifact(index: number, fault?: "alternative" | "stale-summary") {
  const artifact = inventoryWebArtifact(index), c = inventoryContexts[index]!;
  if (artifact.type !== "source") throw new Error("The original demonstration requires executable source");
  const extra = '<section class="panel"><h2>Written demonstration alternative</h2><p id="demonstration-alternative" role="status" aria-live="polite"></p><p>Original StarLiz synthetic inventory code and flow visual, adapted in my private learning project. No third-party media or real personal data is required.</p><p>Record this task and original visual. Attach your video and written alternative privately.</p></section>';
  const wrapper = `const demonstrationResponses=[];let demonstratedQuantity=null;const actualFetch=fetch;
async function demonstrationFetch(address,options={}){const response=await actualFetch(address,options);const body=await response.json();demonstrationResponses.push(response.status);if(response.ok)demonstratedQuantity=body.item?body.item.quantity:body.items[0].quantity;document.getElementById('demonstration-alternative').textContent=${fault === "alternative" ? "''" : `'Flow: draft, request, confirmed state. HTTP: '+demonstrationResponses.join(', ')+'. Quantity: '+${fault === "stale-summary" ? String(c.initial) : "demonstratedQuantity"}+'. Private local run; hosting, offline use and full security are unverified.'`};return {ok:response.ok,status:response.status,json:async()=>body};}
`;
  return { ...artifact, html: artifact.html!.replace(' id="credits"', "").replace("</main>", `${extra}</main>`), source: wrapper + artifact.source.replaceAll("await fetch(", "await demonstrationFetch(") };
}
export function demonstrationCases(id: string, index: number) { const c = inventoryContexts[index]!; return webServiceCases(id, index).map(test => {
  const input = test.input as Record<string, Json>, fixture = input.fixtureService as Record<string, Json>;
  const status = fixture.role === "viewer" ? 403 : Array.isArray(fixture.failWriteAt) && fixture.failWriteAt.length ? 503 : 200;
  const add = (input.events as Array<Record<string, Json>>).some(event => event.target === "direction" && event.value === "add");
  const quantity = c.initial + (status === 200 ? add ? c.move : -c.move : 0);
  return { ...test, assertions: [...test.assertions, eq("result.textsById.demonstration-alternative", `Flow: draft, request, confirmed state. HTTP: 200, ${status}. Quantity: ${quantity}. Private local run; hosting, offline use and full security are unverified.`, "The accessible written alternative follows the actual observed task, successful or refused, and cannot conceal a limitation or retain stale evidence"), containsText("result.bodyText", "Original StarLiz synthetic inventory code and flow visual, adapted in my private learning project. No third-party media or real personal data is required.", "Original source and permitted visual provenance remain stated without inventing third-party permissions")] };
}); }
export function demonstrationDebugCases(id: string, index: number) {
  const cases = demonstrationCases(id, index);
  return [cases[1]!, cases[0]!, ...cases.slice(2)];
}
