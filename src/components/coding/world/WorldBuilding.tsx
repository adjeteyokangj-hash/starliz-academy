import type { LocationId } from "@/lib/coding/world/model";
const palettes = { pizza: ["#e9bd88", "#ca7f55", "#e16d5c"], robot: ["#aac6d8", "#7397b1", "#678b91"], farm: ["#e9cc84", "#bca36d", "#7da779"], traffic: ["#c9c2e0", "#958cba", "#8aaac0"], space: ["#d9e5dd", "#a8c1b8", "#80a8c1"], pets: ["#e7c5ca", "#c18e9b", "#91b7a6"] } as const;
/** Small vector buildings share the world's supported isometric viewpoint. */
export default function WorldBuilding({ location, level = 0 }: { location: LocationId; level?: number }) {
  const [front, side, roof] = palettes[location];
  return <svg viewBox="0 0 150 118" aria-hidden="true" style={{ width: "100%", height: "auto", maxWidth: 140, display: "block", overflow: "visible" }}>
    <ellipse cx="76" cy="105" rx="57" ry="10" fill="#48683a" opacity=".14"/>
    <path d="M26 59L78 81L128 57L78 35Z" fill={roof}/><path d="M26 59V91L78 113V81Z" fill={front}/><path d="M78 81V113L128 89V57Z" fill={side}/>
    <path d="M18 57L78 20L137 55L78 84Z" fill={roof} stroke="#fff8" strokeWidth="2"/>
    <path d="M40 75L52 80V94L40 89Z" fill="#fff2ca"/><path d="M58 83L69 88V102L58 97Z" fill="#fff2ca"/>
    <path d="M90 85L104 79V102L90 108Z" fill="#365e58"/><path d="M111 75L121 71V83L111 88Z" fill="#e6f3e3"/>
    {level > 0 && <><path d="M31 85V46" stroke="#53764f" strokeWidth="2"/><path d="M32 46L49 51L32 57Z" fill="#e9ca79"/><text x="37" y="55" fontSize="9" fill="#74561f">★</text>{level > 1 && <g><path d="M112 103L127 96L137 101L122 109Z" fill="#edf1cc"/><path d="M122 109V115L137 107V101Z" fill="#86a272"/><circle cx="122" cy="99" r="6" fill="#8db777"/></g>}</>}
    {location === "pizza" && <><path d="M28 59L76 81V89L28 67Z" fill="#fff6e9"/>{[33,45,57,69].map(x => <path key={x} d={`M${x} ${61 + (x - 28) * .46}l6 3v8l-6 -3Z`} fill="#d76b55"/>)}<text x="78" y="52" textAnchor="middle" fontSize="28">🍕</text></>}
    {location === "robot" && <><path d="M105 41V14L116 18V47" fill="#7d99aa"/><path d="M105 14L111 11L122 15L116 18Z" fill="#afc6cf"/><rect x="62" y="31" width="27" height="22" rx="5" fill="#ebf0e5"/><circle cx="70" cy="42" r="3" fill="#406b72"/><circle cx="82" cy="42" r="3" fill="#406b72"/></>}
    {location === "farm" && <><path d="M37 52L78 29L116 51L78 69Z" fill="#d2e1a5"/><path d="M78 56V33M78 45Q61 32 64 47Q69 55 78 52M78 43Q96 26 92 44Q89 51 78 50" stroke="#5b8b5b" strokeWidth="4" fill="#6c9f65"/></>}
    {location === "traffic" && <><path d="M130 86V50" stroke="#5b746e" strokeWidth="4"/><rect x="122" y="37" width="16" height="35" rx="5" fill="#35544d"/><circle cx="130" cy="45" r="4" fill="#ed9b75"/><circle cx="130" cy="55" r="4" fill="#efd688"/><circle cx="130" cy="65" r="4" fill="#b7e6a1"/><text x="78" y="53" textAnchor="middle" fontSize="24">↗</text></>}
    {location === "space" && <><path d="M63 53V29Q77 -4 91 29V53Z" fill="#f5f6e9" stroke="#719eaa" strokeWidth="2"/><circle cx="77" cy="31" r="6" fill="#9bc7cf"/><path d="M63 43L55 56H64M91 43L99 56H91" fill="#d48d6a"/></>}
    {location === "pets" && <><circle cx="77" cy="47" r="10" fill="#f9efe6"/>{[[62,34],[73,28],[86,31],[95,40]].map(([x,y]) => <ellipse key={x} cx={x} cy={y} rx="5" ry="6" fill="#f9efe6"/>)}</>}
  </svg>;
}
