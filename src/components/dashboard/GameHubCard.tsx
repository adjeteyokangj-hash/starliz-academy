import Link from "next/link";

type Props = {
  cardKey: string;
  href: string;
  title: string;
  description: string;
  badge: string;
  emoji: string;
  accent: string;
  positionHint?: string;
  pinned?: boolean;
  dragging?: boolean;
  onPinToggle?: () => void;
  onDragStart?: (cardKey: string) => void;
  onDropOnCard?: (cardKey: string) => void;
  onDragEnd?: () => void;
  onMove?: (cardKey: string, direction: "left" | "right" | "up" | "down") => void;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
};

export default function GameHubCard({ cardKey, href, title, description, badge, emoji, accent, positionHint, pinned = false, dragging = false, onPinToggle, onDragStart, onDropOnCard, onDragEnd, onMove, canMoveLeft = false, canMoveRight = false, canMoveUp = false, canMoveDown = false }: Props) {
  return (
    <Link
      href={href}
      draggable={Boolean(onDragStart)}
      onDragStart={() => onDragStart?.(cardKey)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDropOnCard?.(cardKey);
      }}
      onDragEnd={() => onDragEnd?.()}
      className={`group rounded-[28px] bg-[color:var(--surface-strong)] p-5 shadow-sm ring-1 ring-[color:var(--ring-color)] transition hover:-translate-y-1 hover:shadow-xl ${dragging ? "opacity-55 ring-2 ring-offset-2" : ""}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-full bg-white/80 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-slate-700">
              {badge}
            </span>
            {pinned ? <span className="inline-flex rounded-full bg-slate-900 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white">Pinned</span> : null}
            {onDragStart ? <span className="inline-flex rounded-full bg-white/85 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-600">Drag to reorder</span> : null}
          </div>
          <h3 className="mt-4 text-2xl font-black text-slate-900">{title}</h3>
          <p className="mt-2 max-w-xs text-sm leading-6 text-slate-600">{description}</p>
        </div>
        <div
          className="flex h-16 w-16 items-center justify-center rounded-3xl text-3xl shadow-inner"
          style={{ background: accent }}
        >
          {emoji}
        </div>
      </div>
      <div className="mt-5 space-y-3 text-sm font-bold text-slate-700">
        <div className="rounded-2xl bg-white/80 p-2 ring-1 ring-slate-200">
          <div className="mb-1 flex items-center justify-between">
            {positionHint ? <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{positionHint}</span> : <span />}
            <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Controls</span>
          </div>
          <div className="flex flex-wrap items-center gap-1 sm:gap-2">
            {onMove ? (
              <>
              <button
                type="button"
                aria-label={`Move ${title} left`}
                disabled={!canMoveLeft}
                className="h-7 w-7 rounded-full bg-white/95 text-sm text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={(event) => {
                  event.preventDefault();
                  onMove(cardKey, "left");
                }}
              >
                ←
              </button>
              <button
                type="button"
                aria-label={`Move ${title} right`}
                disabled={!canMoveRight}
                className="h-7 w-7 rounded-full bg-white/95 text-sm text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={(event) => {
                  event.preventDefault();
                  onMove(cardKey, "right");
                }}
              >
                →
              </button>
              <button
                type="button"
                aria-label={`Move ${title} up`}
                disabled={!canMoveUp}
                className="h-7 w-7 rounded-full bg-white/95 text-sm text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={(event) => {
                  event.preventDefault();
                  onMove(cardKey, "up");
                }}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move ${title} down`}
                disabled={!canMoveDown}
                className="h-7 w-7 rounded-full bg-white/95 text-sm text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={(event) => {
                  event.preventDefault();
                  onMove(cardKey, "down");
                }}
              >
                ↓
              </button>
              </>
            ) : null}
            {onPinToggle ? (
            <button
              type="button"
              aria-label={pinned ? `Unpin ${title}` : `Pin ${title}`}
              className="h-7 w-7 rounded-full bg-white/95 text-sm text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100"
              onClick={(event) => {
                event.preventDefault();
                onPinToggle();
              }}
            >
              {pinned ? "★" : "☆"}
            </button>
            ) : null}
          </div>
        </div>
        <span className="block w-full rounded-xl bg-[image:var(--btn-primary)] px-4 py-2 text-center text-white shadow-md">Open activity</span>
      </div>
    </Link>
  );
}
