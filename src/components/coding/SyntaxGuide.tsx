"use client";
import { useState } from "react";
import type { SyntaxPiece } from "@/lib/coding/learning/code-guidance";

export default function SyntaxGuide({ pieces }: { pieces: SyntaxPiece[] }) {
  const [selected, setSelected] = useState("");
  if (!pieces.length) return null;
  const piece = pieces.find(item => item.id === selected) ?? pieces[0]!;
  return <section className="function-guide" aria-label="Read the code, piece by piece"><p className="function-guide-label">READ BEFORE YOU WRITE</p><h3>Read the code, piece by piece</h3><p>Start with one idea. Choose the next when you are ready.</p><div className="flex flex-wrap gap-2 mt-3">{pieces.map((item, index) => <button type="button" key={item.id} className="min-h-11 rounded-lg border border-violet-200 px-3 py-2 text-sm aria-pressed:bg-violet-100" aria-pressed={item.id === piece.id} onClick={() => setSelected(item.id)}>{index + 1}. {item.title}</button>)}</div><div className="function-guide-explanation" aria-live="polite"><h4>{piece.title}</h4><pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-slate-900 p-3 text-sm text-slate-100">{piece.code}</pre><p>{piece.explanation}</p></div></section>;
}
