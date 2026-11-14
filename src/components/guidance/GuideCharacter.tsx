import { characters, type Character } from "./guide";

export default function GuideCharacter({ character, alternate }: { character: Character; alternate?: boolean }) {
  return <svg className="starliz-guide-art" viewBox="0 0 112 122" aria-hidden="true" data-character={character}>
    {character === "Finn" && <image className="starliz-guide-sprite starliz-finn-folded" href="/coding/guide/finn-folded.webp"
      x="0" y="0" width="112" height="116" />}
    <image className={character === "Finn" ? "starliz-guide-sprite starliz-finn-open" : "starliz-guide-sprite"} href={`/coding/guide/${characters[character]}${alternate ? "-alternate" : ""}.webp`}
      x="0" y="0" width="112" height="116" />
  </svg>;
}
