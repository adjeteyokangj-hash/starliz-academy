"use client";

import { useEffect, useReducer, useRef, useState } from "react";

import { subscribeTelemetry } from "@/lib/engines/telemetry-engine";
import type { TelemetryEvent } from "@/lib/engines/telemetry-engine";

const MAX_PANEL_EVENTS = 50;

type PanelEvent = {
  id: string;
  eventName: string;
  previousSessionState: string | null;
  nextSessionState: string | null;
  accepted: boolean;
  timestamp: number;
};

function extractPanelEvent(event: TelemetryEvent): PanelEvent {
  const payload = event.payload ?? {};
  return {
    id: event.id,
    eventName: String(payload.eventName ?? event.name),
    previousSessionState: payload.previousSessionState != null ? String(payload.previousSessionState) : null,
    nextSessionState: payload.nextSessionState != null ? String(payload.nextSessionState) : null,
    accepted: payload.transitionAccepted === true,
    timestamp: event.timestamp,
  };
}

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  if (diffMs < 1000) {
    return "just now";
  }
  if (diffMs < 60_000) {
    return `${Math.floor(diffMs / 1000)}s ago`;
  }
  return `${Math.floor(diffMs / 60_000)}m ago`;
}

type Action = { type: "ADD_EVENT"; event: PanelEvent };

function eventsReducer(state: PanelEvent[], action: Action): PanelEvent[] {
  if (action.type === "ADD_EVENT") {
    const updated = [action.event, ...state];
    return updated.slice(0, MAX_PANEL_EVENTS);
  }
  return state;
}

/**
 * TutorRuntimeDebugPanel
 *
 * Passive, dev-only floating panel that subscribes to telemetry events from
 * the tutor runtime engine and displays them in real time.
 *
 * This component has no effect on runtime decisions, lesson behaviour, or
 * database state. It renders nothing in production.
 *
 * Drop it anywhere in a dev layout or page to inspect the runtime event stream.
 */
export default function TutorRuntimeDebugPanel() {
  const isDev = process.env.NODE_ENV === "development";

  const [events, dispatch] = useReducer(eventsReducer, []);
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!isDev) {
      return;
    }

    const unsubscribe = subscribeTelemetry((event) => {
      dispatch({ type: "ADD_EVENT", event: extractPanelEvent(event) });
    });

    return unsubscribe;
  }, [isDev]);

  if (!isDev) {
    return null;
  }

  return (
    <div
      aria-label="Tutor runtime debug panel"
      className="fixed bottom-6 left-4 z-50 flex w-72 flex-col overflow-hidden rounded-2xl border border-slate-200/60 bg-white/95 shadow-[0_20px_50px_rgba(0,0,0,0.22)] backdrop-blur-sm"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
          <span className="inline-block h-2 w-2 rounded-full bg-indigo-500" />
          Tutor runtime
          {events.length > 0 && (
            <span className="ml-1 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
              {events.length}
            </span>
          )}
        </span>
        <span className="text-slate-400 text-xs" aria-hidden="true">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-100">
          {events.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-slate-400">
              No events yet. Dispatch a tutor event to see it here.
            </p>
          ) : (
            <ul
              ref={listRef}
              className="max-h-72 divide-y divide-slate-50 overflow-y-auto"
              aria-label="Telemetry event log"
            >
              {events.map((evt) => (
                <li key={`${evt.id}-${evt.timestamp}`} className="flex flex-col gap-0.5 px-3 py-2">
                  <div className="flex items-center justify-between gap-1">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                          evt.accepted ? "bg-emerald-500" : "bg-rose-500"
                        }`}
                        aria-label={evt.accepted ? "accepted" : "rejected"}
                      />
                      <span className="truncate text-[11px] font-semibold text-slate-700">
                        {evt.eventName}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] text-slate-400">
                      {formatRelativeTime(evt.timestamp)}
                    </span>
                  </div>
                  {(evt.previousSessionState != null || evt.nextSessionState != null) && (
                    <p className="ml-3 text-[10px] text-slate-500">
                      {evt.previousSessionState ?? "—"}
                      {" → "}
                      {evt.nextSessionState ?? "—"}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-slate-100 px-3 py-1.5 text-[10px] text-slate-400">
            Shows last {MAX_PANEL_EVENTS} events · dev only
          </div>
        </div>
      )}
    </div>
  );
}
