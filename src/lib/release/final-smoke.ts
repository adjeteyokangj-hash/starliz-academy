export function isFinalSmokeEnabled(flag = process.env.E2E_FINAL_SMOKE): boolean {
  return String(flag ?? "0").trim() === "1";
}