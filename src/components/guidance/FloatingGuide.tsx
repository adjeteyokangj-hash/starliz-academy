"use client";

import { useEffect, useRef, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import GuideCharacter from "./GuideCharacter";
import { guideTarget, type Character } from "./guide";

export type RestingPosition = { x: number; y: number };
const corner = { x: 1, y: 1 };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const gap = 12;

type Props = {
  character: Character;
  alternate?: boolean;
  resting?: RestingPosition;
  target?: string;
  highlight: boolean;
  reducedMotion?: boolean;
  expanded: boolean;
  thinking: boolean;
  speaking: boolean;
  celebration: number;
  onToggle: () => void;
  onRest: (position: RestingPosition) => void;
  children: ReactNode;
  settings: ReactNode;
};

export default function FloatingGuide({ character, alternate, resting = corner, target, highlight, reducedMotion, expanded, thinking, speaking, celebration, onToggle, onRest, children, settings }: Props) {
  const widget = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const figure = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const manual = useRef<{ target?: string } | null>(null);

  useEffect(() => {
    const node = widget.current;
    const characterButton = figure.current;
    const content = panel.current;
    if (!node || !characterButton || !content) return;
    if (manual.current?.target !== target) manual.current = null;
    let element: HTMLElement | undefined;
    let frame = 0;
    let movement: Animation | undefined;
    let previousTarget: HTMLElement | undefined;

    const resize = new ResizeObserver(schedule);
    resize.observe(content);
    resize.observe(characterButton);
    resize.observe(document.body);

    function schedule() {
      if (!frame) frame = requestAnimationFrame(place);
    }

    function place() {
      frame = 0;
      if (!node || !content || !characterButton || drag.current) return;
      const found = target ? guideTarget(target) ?? (target === "coding-task-description" ? guideTarget("lesson-instructions") : undefined) : undefined;
      if (found !== element) {
        if (element) { resize.unobserve(element); element.removeAttribute("data-guide-highlight"); }
        element = found;
        if (element) resize.observe(element);
      }
      if (element) element.toggleAttribute("data-guide-highlight", highlight);

      const vw = document.documentElement.clientWidth;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const rect = element?.getBoundingClientRect();
      const visible = rect && rect.bottom > 0 && rect.top < vh && rect.right > 0 && rect.left < vw;
      const targetX = visible ? (Math.max(0, rect.left) + Math.min(vw, rect.right)) / 2 : 0;
      const targetY = visible ? (Math.max(0, rect.top) + Math.min(vh, rect.bottom)) / 2 : 0;
      const obstacles = Array.from(document.querySelectorAll(
        "button, a[href], input, select, textarea, summary, [data-guide-target='block-editor'], .cm-editor, .blocklyWidgetDiv, .blocklyDropDownDiv",
      )).filter(control => !node.contains(control) && !control.closest(".starliz-guide-settings-dialog"))
        .map(control => control.getBoundingClientRect())
        .filter(box => box.width && box.height && box.bottom > 0 && box.top < vh);
      if (visible) obstacles.push(rect);

      const characterWidth = characterButton.offsetWidth;
      const characterHeight = characterButton.offsetHeight;
      const panelWidth = expanded ? content.offsetWidth : 0;
      const panelHeight = expanded ? content.offsetHeight : 0;
      function findPosition(w: number, h: number) {
        const maxX = Math.max(gap, vw - w - gap), maxY = Math.max(gap, vh - h - gap);
        const restX = gap + (maxX - gap) * resting.x, restY = gap + (maxY - gap) * resting.y;
        const keepX = (x: number) => clamp(x, gap, maxX);
        const keepY = (y: number) => clamp(y, gap, maxY);
        const clear = (x: number, y: number) => obstacles.every(box =>
          x + w <= box.left || x >= box.right || y + h <= box.top || y >= box.bottom,
        );
        const candidates: [number, number][] = [];
        if (visible && !manual.current) {
          candidates.push(
            [rect.right + gap, keepY(targetY - h / 2)],
            [rect.left - w - gap, keepY(targetY - h / 2)],
            [keepX(targetX - w / 2), rect.top - h - gap],
            [keepX(targetX - w / 2), rect.bottom + gap],
          );
        }

        for (const box of obstacles) {
          candidates.push(
            [keepX(restX), box.top - h - gap], [keepX(restX), box.bottom + gap],
            [box.left - w - gap, keepY(restY)], [box.right + gap, keepY(restY)],
          );
        }
        if (visible && !manual.current) {
          candidates.sort(([x1, y1], [x2, y2]) =>
            Math.hypot(x1 + w / 2 - targetX, y1 + h / 2 - targetY) -
            Math.hypot(x2 + w / 2 - targetX, y2 + h / 2 - targetY),
          );
        }
        if (manual.current || !visible) candidates.unshift([restX, restY]);
        candidates.push([restX, restY], [maxX, maxY], [gap, maxY], [maxX, gap], [gap, gap]);
        return candidates.find(([x, y]) => x >= gap && y >= gap && x <= maxX && y <= maxY && clear(x, y));
      }

      const full = findPosition(characterWidth + (panelWidth ? panelWidth + gap : 0), Math.max(characterHeight, panelHeight));
      const compact = expanded && !full;
      const position = full ?? findPosition(characterWidth, characterHeight) ?? [Math.max(gap, vw - characterWidth - gap), gap];
      const [x, y] = position;
      const reverse = Boolean(visible && targetX > x + characterWidth && !compact);
      const anchorX = x + (reverse && panelWidth ? panelWidth + gap : 0) + characterWidth / 2;
      const anchorY = y + Math.max(characterHeight, compact ? 0 : panelHeight) / 2;
      const pointX = visible ? clamp(anchorX, Math.max(0, rect.left), Math.min(vw, rect.right)) : anchorX;
      const pointY = visible ? clamp(anchorY, Math.max(0, rect.top), Math.min(vh, rect.bottom)) : anchorY;
      const angle = Math.atan2(pointY - anchorY, pointX - anchorX);
      node.style.setProperty("--guide-pointer-length", `${Math.max(0, Math.hypot(pointX - anchorX, pointY - anchorY) - 4)}px`);
      const previousX = parseFloat(node.style.getPropertyValue("--guide-x"));
      const previousY = parseFloat(node.style.getPropertyValue("--guide-y"));
      node.style.setProperty("--guide-x", `${Math.round(x)}px`);
      node.style.setProperty("--guide-y", `${Math.round(y)}px`);
      node.style.setProperty("--guide-angle", `${angle}rad`);
      node.toggleAttribute("data-settings-right", x < 60);
      node.toggleAttribute("data-facing-left", Boolean(visible && targetX < anchorX));
      node.toggleAttribute("data-reverse", reverse);
      node.toggleAttribute("data-pointing", Boolean(visible && highlight));
      node.toggleAttribute("data-guide-away", Boolean(target && !visible && element));
      node.toggleAttribute("data-guide-docked", compact);

      if (Number.isFinite(previousX) && !manual.current && Math.hypot(x - previousX, y - previousY) > 20 &&
        !reducedMotion && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        movement?.cancel();
        const float = ["Nova", "Astro", "Orbit"].includes(character);
        const walk = ["Byte", "Gear", "Pixel"].includes(character);
        const hop = float ? 9 : walk ? 4 : element !== previousTarget ? 24 : 11;
        const start = { transform: `translate(${previousX}px, ${previousY}px)` };
        const end = { transform: `translate(${x}px, ${y}px)` };
        const step = (fraction: number, lift: number) => ({ transform: `translate(${previousX + (x - previousX) * fraction}px, ${Math.max(gap, previousY + (y - previousY) * fraction - lift)}px)` });
        movement = node.animate(character === "Finn" ? [start, step(.24, 9), step(.5, 0), step(.76, 9), end] : [
          { transform: `translate(${previousX}px, ${previousY}px)` },
          { transform: `translate(${(x + previousX) / 2}px, ${Math.max(gap, (y + previousY) / 2 - hop)}px)` },
          { transform: `translate(${x}px, ${y}px)` },
        ], { duration: float ? 500 : walk ? 400 : 360, easing: float ? "ease-in-out" : "ease-out" });
      }

      previousTarget = element;
    }

    const mutations = new MutationObserver(records => {
      if (records.some(record => !node.contains(record.target))) schedule();
    });
    mutations.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "open", "hidden", "aria-expanded", "transform"] });
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    schedule();
    return () => {
      movement?.cancel();
      cancelAnimationFrame(frame);
      element?.removeAttribute("data-guide-highlight");
      resize.disconnect();
      mutations.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
    };
  }, [resting, highlight, expanded, reducedMotion, target, character]);

  function move(event: PointerEvent<HTMLButtonElement>) {
    const start = drag.current, node = widget.current;
    if (!start || !node) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (!start.moved && Math.hypot(dx, dy) < 5) return;
    start.moved = true;
    node.dataset.dragging = "true";
    node.style.setProperty("--guide-x", `${clamp(start.left + dx, gap, document.documentElement.clientWidth - node.offsetWidth - gap)}px`);
    node.style.setProperty("--guide-y", `${clamp(start.top + dy, gap, window.innerHeight - node.offsetHeight - gap)}px`);
  }

  function finish() {
    const node = widget.current;
    if (!node || !drag.current?.moved) { drag.current = null; return; }
    manual.current = { target };
    const x = parseFloat(node.style.getPropertyValue("--guide-x"));
    const y = parseFloat(node.style.getPropertyValue("--guide-y"));
    onRest({
      x: clamp((x - gap) / Math.max(1, document.documentElement.clientWidth - node.offsetWidth - 2 * gap), 0, 1),
      y: clamp((y - gap) / Math.max(1, window.innerHeight - node.offsetHeight - 2 * gap), 0, 1),
    });
    drag.current = null;
    delete node.dataset.dragging;
  }

  return createPortal(
    <div ref={widget} className="starliz-guide-widget" data-reduced-motion={reducedMotion || undefined} data-expanded={expanded} data-character={character}
      data-speaking={speaking || undefined} data-thinking={thinking || undefined} data-waiting={expanded && Boolean(target) && !thinking && !speaking || undefined}>
      <div className="starliz-guide-anchor">
      <button ref={figure} type="button" className="starliz-guide-character" aria-expanded={expanded} aria-label={expanded ? "Minimise helper" : "Expand helper"} onClick={event => { if (event.detail === 0) onToggle(); }}
        onPointerDown={event => {
          if (!event.isPrimary || event.button !== 0 || !widget.current) return;
          const rect = widget.current.getBoundingClientRect();
          drag.current = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={move}
        onPointerUp={() => { if (drag.current && !drag.current.moved) onToggle(); finish(); }}
        onPointerCancel={finish}
        onLostPointerCapture={finish}>
        <span key={celebration} className="starliz-guide-figure" data-celebrate={expanded && celebration > 0 || undefined}><GuideCharacter character={character} alternate={alternate} /></span>
        <span className="starliz-guide-pointer" aria-hidden="true" />
      </button>
      {settings}
      </div>
      <button type="button" className="starliz-guide-reveal" onClick={() => window.scrollBy({ top: Math.round(window.innerHeight * .6), behavior: "instant" })}>More room for the Guide ↓</button>
      <div ref={panel} className="starliz-guide-panel" hidden={!expanded}>{children}</div>
    </div>, document.body,
  );
}
