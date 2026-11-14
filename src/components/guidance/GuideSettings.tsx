"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import GuideCharacter from "./GuideCharacter";
import { characters, type Character } from "./guide";

type Props = {
  character: Character;
  alternateAppearances?: Partial<Record<Character, boolean>>;
  onCharacter: (character: Character) => void;
  children: ReactNode;
};

export default function GuideSettings({ character, alternateAppearances, onCharacter, children }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    if (!open || !dialog.current || !trigger.current) return;
    const panel = dialog.current;
    const button = trigger.current;
    const anchor = button.parentElement ?? button;
    let frame = 0;
    let previous = "";
    function position() {
      const view = window.visualViewport;
      const left = view?.offsetLeft ?? 0;
      const top = view?.offsetTop ?? 0;
      const width = view?.width ?? document.documentElement.clientWidth;
      const height = view?.height ?? window.innerHeight;
      const rect = anchor.getBoundingClientRect();
      const key = [left, top, width, height, rect.left, rect.top, rect.width, rect.height, panel.offsetHeight, window.scrollX, window.scrollY].join();
      if (key !== previous) {
        previous = key;
        const edge = 12;
        const mobile = width < 640;
        panel.style.maxHeight = Math.max(0, (mobile ? height * .55 : height * .75) - edge * 2) + "px";
        panel.style.width = Math.min(mobile ? width - edge * 2 : 414, width - edge * 2) + "px";
        const w = panel.offsetWidth;
        const h = panel.offsetHeight;
        const minX = left + edge;
        const maxX = left + width - edge - w;
        const minY = top + edge;
        const maxY = top + height - edge - h;
        const x = (value: number) => Math.max(minX, Math.min(maxX, value));
        const y = (value: number) => Math.max(minY, Math.min(maxY, value));
        const widget = anchor.closest(".starliz-guide-widget");
        const preferLeft = widget?.hasAttribute("data-reverse") === false;
        const besideLeft = rect.left - w - edge;
        const besideRight = rect.right + edge;
        const beside = preferLeft && besideLeft >= minX ? besideLeft
          : besideRight <= maxX ? besideRight : besideLeft;
        const middleY = y(rect.top + rect.height / 2 - h / 2);
        const candidates = mobile ? [[minX, maxY]] : [
          [x(beside), middleY], [x(besideRight), middleY], [x(besideLeft), middleY],
          [x(beside), y(rect.bottom + edge)], [x(beside), maxY], [x(beside), minY],
          [minX, maxY], [maxX, maxY], [minX, minY], [maxX, minY],
        ];
        const protectedAreas = Array.from(document.querySelectorAll(
          "[data-guide-highlight], [data-guide-target='block-editor'], .cm-editor",
        )).map(element => element.getBoundingClientRect()).filter(box => box.width && box.height);
        const overlap = (x: number, y: number) => protectedAreas.reduce((area, box) =>
          area + Math.max(0, Math.min(x + w, box.right) - Math.max(x, box.left))
            * Math.max(0, Math.min(y + h, box.bottom) - Math.max(y, box.top)), 0);
        const [panelX, panelY] = candidates.reduce((best, candidate) =>
          overlap(candidate[0], candidate[1]) < overlap(best[0], best[1]) ? candidate : best);
        panel.style.left = panelX + "px";
        panel.style.top = panelY + "px";
      }
      frame = requestAnimationFrame(position);
    }
    position();
    closeButton.current?.focus({ preventScroll: true });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus({ preventScroll: true });
      }
    }
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open]);

  return <>
    <button ref={trigger} type="button" className="starliz-guide-settings-trigger" aria-haspopup="dialog"
      aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => open ? close() : setOpen(true)}>
      <span aria-hidden="true">⚙</span><span className="sr-only">Helper settings</span>
    </button>
    {open && createPortal(
      <div ref={dialog} id={id} className="starliz-guide-settings-dialog" role="dialog" aria-labelledby={id + "-heading"}>
        <header><h2 id={id + "-heading"}>Helper settings</h2><button ref={closeButton} type="button" className="starliz-guide-action" onClick={close}>Close</button></header>
        <div className="starliz-guide-settings-scroll">
          <div className="starliz-guide-settings-controls">{children}</div>
          <fieldset className="starliz-guide-picker">
            <legend>Choose your character</legend>
            <div className="starliz-guide-character-grid">
              {(Object.keys(characters) as Character[]).map(name => <label key={name}>
                <input type="radio" name={id + "-character"} checked={character === name} onChange={() => onCharacter(name)} />
                <GuideCharacter character={name} alternate={alternateAppearances?.[name]} />
                <span>{name}</span>
              </label>)}
            </div>
          </fieldset>
        </div>
      </div>, document.body)}
  </>;
}
