"use client";
import { useEffect, useRef, useState } from "react";
import type { Json } from "@/lib/coding/learning/types";
export default function DataRepresentationExecution({ output }: { output: Record<string, Json> }) {
  const audio = useRef<AudioContext | null>(null), [message, setMessage] = useState("");
  useEffect(() => () => { void audio.current?.close(); }, []);
  const mode = output.representationMode;
  if (mode !== "text" && mode !== "pixels" && mode !== "sound") return null;
  const validDepth = typeof output.representationDepth === "number" && Number.isInteger(output.representationDepth) && output.representationDepth >= 1 && output.representationDepth <= 16;
  const depth = Math.trunc(Math.max(1, Math.min(16, Number(output.representationDepth) || 8))), maximum = 2 ** depth - 1;
  const rawValues = output.quantised;
  const values = Array.isArray(rawValues) ? rawValues.filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= maximum).slice(0, 256) : [];
  const validWidth = typeof output.representationWidth === "number" && Number.isInteger(output.representationWidth) && output.representationWidth >= 1 && output.representationWidth <= 32;
  const validRate = typeof output.sampleRate === "number" && Number.isFinite(output.sampleRate) && output.sampleRate >= 1000 && output.sampleRate <= 48000;
  if (mode !== "text" && (!validDepth || mode === "pixels" && !validWidth || mode === "sound" && !validRate || !Array.isArray(rawValues) || rawValues.length > 256 || values.length !== rawValues.length)) return <p role="alert" className="rounded-lg bg-amber-50 p-3 text-amber-950">The representation contains invalid samples or metadata. Use at most 256 whole values within a valid bit depth, a whole image width or a supported sound sample rate before viewing or playing them.</p>;
  const width = Number(output.representationWidth) || 16, height = Math.max(1, Math.ceil(values.length / width)), rate = Number(output.sampleRate) || 8000;
  async function play() {
    try {
      if (!values.length) { setMessage("Supply actual sample bytes before playing sound."); return; }
      await audio.current?.close();
      const context = new AudioContext(); audio.current = context; await context.resume();
      // Repeat the captured waveform for one second so a short sample is
      // audible; the displayed original duration remains the actual byte count/rate.
      const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate), channel = buffer.getChannelData(0);
      for (let i = 0; i < channel.length; i++) channel[i] = ((values[Math.floor(i * rate / context.sampleRate) % values.length]! / maximum) * 2 - 1) * 0.08;
      const source = context.createBufferSource(); source.buffer = buffer; source.connect(context.destination); source.start();
      source.onended = () => { void context.close(); if (audio.current === context) audio.current = null; };
      setMessage("Playing the actual quantised waveform looped for one second at low volume.");
    } catch { setMessage("Sound playback is unavailable in this browser. The waveform and numeric samples remain visible."); }
  }
  return <section className="space-y-3 rounded-xl border border-slate-300 bg-white p-4"><h3 className="font-bold">Actual {String(mode)} representation</h3>{mode === "text" ? <><p className="text-sm">Decoded UTF-8 bytes: <span className="font-mono">{String(output.decoded ?? "")}</span></p><p className="text-sm">Encoded text: {Array.isArray(output.encoded) ? output.encoded.join(", ") : ""}</p><p className="text-sm">Encoded payload: {String(output.encodedBits)} bits, excluding file metadata.</p></> : <><p className="text-sm">Raw payload: {String(values.length * depth)} bits at {depth} bits per value, excluding headers or compression.</p>{mode === "pixels" && <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Actual greyscale image with ${values.length} pixels, ${width} pixels per row`} className="w-full max-w-sm rounded-lg border border-slate-400" style={{ imageRendering: "pixelated" }}>{values.map((value, index) => { const grey = Math.round(value / maximum * 255); return <rect key={index} x={index % width} y={Math.floor(index / width)} width={1} height={1} fill={`rgb(${grey},${grey},${grey})`}><title>Pixel {index + 1}: {value}</title></rect>; })}</svg>}{mode === "sound" && <><svg viewBox="0 0 600 160" role="img" aria-label="Actual quantised sample waveform" className="w-full rounded-lg bg-slate-50"><path d="M0 80H600" stroke="#94a3b8" /><polyline fill="none" stroke="#0369a1" strokeWidth="2" points={values.map((value, index) => `${index / Math.max(1, values.length - 1) * 600},${150 - value / maximum * 140}`).join(" ")} /></svg><p className="text-sm">Original duration: {String(values.length / rate)} seconds. Sample rate: {String(rate)} per second. Raw bitrate: {String(rate * depth)} bits per second.</p><button type="button" className="min-h-11 rounded-lg bg-sky-800 px-4 py-2 font-semibold text-white" onClick={() => void play()}>Play looped samples</button>{message && <p role="status" className="text-sm text-slate-700">{message}</p>}</>}</>}</section>;
}
