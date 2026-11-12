"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type ProjectInteraction = { target: string; type: "click" | "input" | "change"; value?: string };
type PreviewFocus = { target: string; start: number | null; end: number | null };

function encode(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Student JavaScript executes only on the isolated server. This opaque-origin
 * document runs a fixed bridge that reconstructs an allowlisted, inert DOM and
 * forwards ordinary control events to that server through its parent. */
export function previewDocument(html: string, css: string, channel: string, nonce: string, interactive: boolean, focus: PreviewFocus | null = null): string {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(channel) || !/^[a-zA-Z0-9_-]{1,80}$/.test(nonce)) throw new Error("Invalid preview bridge identity.");
  const data = JSON.stringify({ html: encode(html.slice(0, 32768)), css: encode(css.slice(0, 16384)), channel, interactive, focus: focus ? encode(JSON.stringify(focus)) : "" });
  const bridge = String.raw`(() => {
    'use strict';
    const config=${data};
    const decode=value=>new TextDecoder().decode(Uint8Array.from(atob(value),c=>c.charCodeAt(0)));
    const allowed=new Set('article section main header footer nav aside div span p h1 h2 h3 h4 h5 h6 ul ol li dl dt dd strong em b i u small blockquote pre code br hr table caption thead tbody tfoot tr th td button label input textarea select option output progress meter fieldset legend figure figcaption details summary a img form style'.split(' '));
    const attributes=new Set('id class style title role aria-label aria-labelledby aria-describedby aria-live aria-hidden aria-expanded aria-controls aria-pressed aria-valuenow aria-valuemin aria-valuemax alt for name value placeholder min max step rows cols width height colspan rowspan scope selected checked disabled readonly required multiple open'.split(' '));
    const source=new DOMParser().parseFromString(decode(config.html),'text/html');
    let copied=0;
    function copy(node,depth=0){
      if(++copied>1500||depth>32)return null;
      if(node.nodeType===Node.TEXT_NODE)return document.createTextNode(node.textContent||'');
      if(node.nodeType!==Node.ELEMENT_NODE||node.namespaceURI!=='http://www.w3.org/1999/xhtml'||!allowed.has(node.localName))return null;
      const element=document.createElement(node.localName==='form'?'div':node.localName);
      for(const attribute of node.attributes){
        const name=attribute.name.toLowerCase();
        if(attributes.has(name))element.setAttribute(name,attribute.value.slice(0,1000));
        else if(name==='href'&&node.localName==='a'&&/^#[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(attribute.value))element.setAttribute(name,attribute.value);
        else if(name==='data-starliz-evidence'&&node.localName==='a'&&/^(first|second)$/.test(attribute.value))element.setAttribute(name,attribute.value);
        else if(name==='tabindex'&&/^(?:-1|0)$/.test(attribute.value))element.setAttribute(name,attribute.value);
        else if(name==='type'&&node.localName==='input'&&/^(text|number|checkbox|radio|range|button|submit|email|date|color|password)$/.test(attribute.value))element.setAttribute(name,attribute.value);
        else if(name==='src'&&node.localName==='img'&&/^data:image\/(png|jpeg|gif|webp);base64,[a-zA-Z0-9+/=]+$/.test(attribute.value)&&attribute.value.length<20000)element.setAttribute(name,attribute.value);
      }
      for(const child of node.childNodes){const safe=copy(child,depth+1);if(safe)element.appendChild(safe);}
      return element;
    }
    const style=document.createElement('style');
    style.textContent='body{font:18px system-ui;line-height:1.6;margin:1rem;overflow-wrap:anywhere}img{max-width:100%;height:auto}button,input,select,textarea{font:inherit;max-width:100%;box-sizing:border-box}button:focus-visible,input:focus-visible{outline:3px solid #0369a1}'+decode(config.css);
    document.head.appendChild(style);
    for(const original of source.head.querySelectorAll('style')){const retained=document.createElement('style');retained.textContent=original.textContent.slice(0,16384);document.head.appendChild(retained);}
    for(const child of source.body.childNodes){const safe=copy(child);if(safe)document.body.appendChild(safe);}
    document.addEventListener('click',event=>{
      const link=event.target instanceof Element?event.target.closest('a[href]'):null;if(!link)return;
      event.preventDefault();event.stopImmediatePropagation();
      const target=document.getElementById(link.getAttribute('href').slice(1));if(!target)return;
      target.scrollIntoView({block:'start'});if(!target.hasAttribute('tabindex')&&!target.matches('button,input,select,textarea,a[href]'))target.setAttribute('tabindex','-1');target.focus({preventScroll:true});
      const evidence=link.getAttribute('data-starliz-evidence');if(evidence==='first'||evidence==='second')send({kind:'evidence',slot:evidence});
    });
    function send(value){parent.postMessage({channel:config.channel,...value},'*');}
    function resize(){send({kind:'size',height:Math.min(1200,Math.max(240,document.documentElement.scrollHeight))});}
    new ResizeObserver(resize).observe(document.body);resize();
    const control=element=>element.matches('textarea,select,input:not([type=button]):not([type=submit])');
    const value=element=>element.type==='checkbox'||element.type==='radio'?String(element.checked):typeof element.value==='string'?element.value.slice(0,1000):'';
    if(config.focus){try{const resume=JSON.parse(decode(config.focus)),target=typeof resume.target==='string'&&resume.target.length<=120?document.getElementById(resume.target):null;if(target){target.focus({preventScroll:true});if(typeof target.setSelectionRange==='function'&&Number.isInteger(resume.start)&&Number.isInteger(resume.end)){try{target.setSelectionRange(resume.start,resume.end);}catch{}}}}catch{}}
    if(config.interactive){
      let committed=new WeakMap();for(const element of document.querySelectorAll('input,textarea,select'))committed.set(element,value(element));
      window.addEventListener('message',event=>{if(event.source===parent&&event.data&&event.data.channel===config.channel&&event.data.kind==='retry-inputs')committed=new WeakMap();});
      const focus=(target,editing)=>{if(!target.id||target.id.length>120)return;send({kind:'focus',target:target.id,editing,start:typeof target.selectionStart==='number'?target.selectionStart:null,end:typeof target.selectionEnd==='number'?target.selectionEnd:null});};
      const commit=(target,force=false)=>{focus(target,false);const current=value(target);if(!force&&committed.get(target)===current)return;committed.set(target,current);send({kind:'interaction',target:target.id,type:'change',value:current});};
      document.addEventListener('focusin',event=>{const target=event.target;if(target instanceof Element)focus(target,control(target));});
      document.addEventListener('input',event=>{const target=event.target;if(target instanceof Element&&control(target))focus(target,true);});
      document.addEventListener('change',event=>{const target=event.target;if(target instanceof Element&&target.id&&control(target))commit(target);});
      document.addEventListener('focusout',event=>{const target=event.target;if(target instanceof Element&&target.id&&control(target))commit(target);});
      document.addEventListener('keydown',event=>{const target=event.target;if(event.key==='Enter'&&target instanceof Element&&target.matches('input:not([type=button]):not([type=submit])')){event.preventDefault();commit(target,true);}});
      document.addEventListener('click',event=>{const target=event.target instanceof Element?event.target.closest('[id]'):null;if(!target||!target.id||target.id.length>120||control(target)||target.matches('label'))return;event.preventDefault();send({kind:'interaction',target:target.id,type:'click',value:value(target)});});
    }
  })();`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Saved project preview</title></head><body><script nonce="${nonce}">${bridge}</script></body></html>`;
}

export default function ProjectPreview({ html, css = "", title = "Your project", onInteraction, onEvidence, resizable = false, busy = false, resetKey = "", retryToken = "" }: {
  html: string; css?: string; title?: string; onInteraction?: (interaction: ProjectInteraction) => void; onEvidence?: (slot: "first" | "second") => void; resizable?: boolean; busy?: boolean; resetKey?: string; retryToken?: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const callback = useRef(onInteraction);
  const evidenceCallback = useRef(onEvidence);
  const [height, setHeight] = useState(320);
  const [viewport, setViewport] = useState("fit");
  const [editing, setEditing] = useState(false), [snapshot, setSnapshot] = useState<{ html: string; css: string; key: string; focus: PreviewFocus | null }>({ html, css, key: resetKey, focus: null });
  const focus = useRef<PreviewFocus | null>(null), focusKey = useRef(resetKey);
  const [identity, setIdentity] = useState<{ channel: string; nonce: string } | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setIdentity({ channel: crypto.randomUUID(), nonce: crypto.randomUUID().replaceAll("-", "") }));
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => { callback.current = onInteraction; }, [onInteraction]);
  useEffect(() => { evidenceCallback.current = onEvidence; }, [onEvidence]);
  const interactive = Boolean(onInteraction);
  useEffect(() => {
    if (focusKey.current !== resetKey) { focus.current = null; focusKey.current = resetKey; }
    if (interactive && (busy || editing)) return;
    const update = requestAnimationFrame(() => { const restore = focus.current; setSnapshot((previous) => previous.html === html && previous.css === css && previous.key === resetKey ? previous : { html, css, key: resetKey, focus: restore }); if (!interactive) setEditing(false); });
    return () => cancelAnimationFrame(update);
  }, [html, css, interactive, busy, editing, resetKey]);
  const document = useMemo(() => identity ? previewDocument(snapshot.html, snapshot.css, identity.channel, identity.nonce, interactive, snapshot.focus) : "", [snapshot, identity, interactive]);
  useEffect(() => { if (retryToken && identity) frame.current?.contentWindow?.postMessage({ channel: identity.channel, kind: "retry-inputs" }, "*"); }, [retryToken, identity]);
  useEffect(() => {
    if (!identity) return;
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== "null" || !event.data || event.data.channel !== identity.channel) return;
      const value = event.data;
      if (value.kind === "evidence" && (value.slot === "first" || value.slot === "second")) evidenceCallback.current?.(value.slot);
      if (value.kind === "size" && typeof value.height === "number" && Number.isFinite(value.height)) setHeight(Math.max(240, Math.min(1200, value.height)));
      if (value.kind === "focus" && typeof value.target === "string" && value.target.length > 0 && value.target.length <= 120 && typeof value.editing === "boolean") {
        const position = (number: unknown) => typeof number === "number" && Number.isInteger(number) && number >= 0 && number <= 1000 ? number : null;
        focus.current = { target: value.target, start: position(value.start), end: position(value.end) }; setEditing(value.editing);
      }
      if (value.kind === "interaction" && ["click", "input", "change"].includes(value.type) && typeof value.target === "string" && value.target.length <= 120 && typeof value.value === "string" && value.value.length <= 1000) {
        callback.current?.({ type: value.type, target: value.target, value: value.value });
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [identity]);
  const fixedWidth = resizable && viewport !== "fit" ? Number(viewport) : undefined;
  return <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-300 bg-white text-slate-950">
    {resizable && <label className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3 text-sm font-semibold">Preview size<select className="min-h-11 max-w-full rounded-lg border border-slate-400 bg-white px-3 font-normal" value={viewport} onChange={(event) => setViewport(["320", "768", "1024"].includes(event.target.value) ? event.target.value : "fit")}><option value="fit">Fit workspace</option><option value="320">Phone (320px)</option><option value="768">Tablet (768px)</option><option value="1024">Desktop (1024px)</option></select></label>}
    <div className="max-w-full overflow-x-auto" tabIndex={resizable ? 0 : undefined} role={resizable ? "region" : undefined} aria-label={resizable ? "Scrollable project preview" : undefined}>
      <iframe ref={frame} title={title} srcDoc={document} sandbox="allow-scripts" referrerPolicy="no-referrer"
        className="block w-full border-0" style={{ height, width: fixedWidth, maxWidth: fixedWidth ? "none" : undefined }} />
    </div>
    <p className="border-t border-slate-200 px-3 py-2 text-xs text-slate-600">{interactive ? "Leave a field to apply your entry; Enter also applies single-line fields. Use buttons to try your project." : "Saved project preview"}</p>
  </div>;
}
