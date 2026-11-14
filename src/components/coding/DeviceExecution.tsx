"use client";
import { useState } from "react";
import type { Json } from "@/lib/coding/learning/types";
const record = (value: Json | undefined): Record<string, Json> => value && typeof value === "object" && !Array.isArray(value) ? value : {};
export default function DeviceExecution({ outputs }: { outputs: Json | undefined }) {
  const [message, setMessage] = useState("");
  if (!Array.isArray(outputs) || !outputs.length) return null;
  return <section className="space-y-3" aria-label="Actual simulated device outputs"><h3 className="font-bold">Device demonstrations</h3><div className="grid gap-3 sm:grid-cols-2">{outputs.map((item, index) => {
    const device = record(item), output = record(device.output), pixels = Array.isArray(output.pixels) ? output.pixels : [], width = Math.max(1, Math.min(16, Number(output.width) || 1)), height = Math.max(1, Math.min(16, Number(output.height) || 1));
    return <article key={index} className="min-w-0 space-y-3 rounded-xl border border-slate-300 bg-white p-4"><h4 className="font-semibold">{String(device.device)} · {String(device.action)}</h4>{device.correct !== true ? <p className="text-sm text-amber-950">This device does not support the chosen action.</p> : pixels.length > 0 ? <svg viewBox={`0 0 ${width} ${height}`} className="block w-full max-w-48 rounded-lg border border-slate-300" style={{ imageRendering: "pixelated" }} role="img" aria-label={`${device.device} captured ${pixels.length} actual supplied picture pixels`}>{pixels.slice(0, 256).map((value, index) => <rect key={index} x={index % width} y={Math.floor(index / width)} width={1} height={1} fill={typeof value === "string" && /^#[a-f0-9]{6}$/i.test(value) ? value : "#000000"} />)}</svg> : typeof output.distance === "number" ? <p className="text-lg font-semibold">Measured distance: {output.distance} {String(output.unit)}</p> : <p className="whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-base text-slate-950">{String(device.output ?? "")}</p>}{device.correct === true && device.device === "speaker" && typeof device.output === "string" && <button type="button" className="min-h-11 rounded-lg bg-sky-800 px-3 py-2 text-sm font-semibold text-white" onClick={() => {
      if (!("speechSynthesis" in window)) { setMessage("Spoken output is unavailable here. The actual supplied words remain visible."); return; }
      speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(String(device.output)); utterance.lang = "en-GB"; speechSynthesis.speak(utterance); setMessage("Reading the simulated speaker's actual supplied words.");
    }}>Hear simulated speaker</button>}</article>;
  })}</div>{message && <p role="status" className="text-sm text-slate-700">{message}</p>}</section>;
}
