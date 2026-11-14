"use client";

import { useEffect, useRef, useState } from "react";
import { codingFeedback, type CodingOutcome, type RunHistory } from "./coding-guide-outcomes";

export default function CodingGuideTools({ blocks, reducedMotion }: { blocks?: boolean; reducedMotion?: boolean }) {
  const history = useRef<RunHistory>({ succeeded: false, failed: false });
  const [notice, setNotice] = useState<{ message: string; celebrate?: boolean; count: number }>();
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    const receive = (event: Event) => {
      const result = codingFeedback(history.current, (event as CustomEvent<CodingOutcome>).detail);
      history.current = result.history;
      setNotice(previous => ({ ...result, count: (previous?.count ?? 0) + 1 }));
    };
    document.addEventListener("starliz-coding-outcome", receive);
    return () => document.removeEventListener("starliz-coding-outcome", receive);
  }, []);

  return <>
    {notice && <p key={notice.count} role="status" className="mb-2 text-sm" data-coding-guide-cheer={notice.celebrate && !reducedMotion ? "" : undefined}>{notice.celebrate ? "★ " : ""}{notice.message}</p>}
    {blocks && (demo ? <figure className="mb-2 rounded-lg border border-violet-200 p-2">
      <figcaption className="text-sm">In this example, drag the action below Start until the blocks snap together.</figcaption>
      <svg viewBox="0 0 200 102" aria-hidden="true" className="mx-auto w-full max-w-48">
        <path d="M10 10h105v24H47l-5 5h-12l-5-5H10Z" fill="#6d28d9" />
        <text x="21" y="27" fontSize="13" fill="white">Start</text>
        <g className={reducedMotion ? undefined : "coding-guide-demo-action"}>
          <path d="M10 39h15l5 5h12l5-5h68v24H10Z" fill="#047857" />
          <text x="21" y="57" fontSize="13" fill="white">Example action</text>
        </g>
      </svg>
      <button type="button" className="starliz-guide-action" onClick={() => setDemo(false)}>Try it myself</button>
    </figure> : <button type="button" className="starliz-guide-action" onClick={() => setDemo(true)}>Show how blocks connect</button>)}
  </>;
}
