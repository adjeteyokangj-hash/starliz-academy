import { locations, type LocationId } from "@/lib/coding/world/model";
type Point = { x: number; y: number };
export default function WorldRouteView({ location, width = 6, height = 6, actors, goal, obstacles = [], track = [], stops = [] }: { location: LocationId; width?: number; height?: number; actors: Array<{ name: string; visits: Point[] }>; goal?: Point | null; obstacles?: Point[]; track?: Point[]; stops?: Point[] }) {
  const place = locations.find(place => place.id === location)!;
  const colours = { pizza: "#fff0d6", robot: "#dceaf1", farm: "#dcebcf", traffic: "#e0e8e8", space: "#dfe3f4", pets: "#f1e3e2" };
  const token = { pizza: "🛵", robot: "🤖", farm: "🚜", traffic: "🚙", space: "🚀", pets: "🐈" };
  const size = 48, px = (x: number) => (x + .5) * size, py = (y: number) => (height - y - .5) * size;
  return <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3"><p className="mb-2 text-sm font-bold text-emerald-950">{place.title} · actual lesson execution</p><svg viewBox={`0 0 ${width * size} ${height * size}`} role="img" aria-label={`${place.title} guided simulation showing recorded lesson movements`} style={{ display: "block", width: "100%", maxWidth: 480, height: "auto", margin: "auto", background: colours[location], borderRadius: 12 }}>
    {Array.from({ length: width * height }, (_, i) => <rect key={i} x={i % width * size + 2} y={Math.floor(i / width) * size + 2} width={size - 4} height={size - 4} rx={8} fill="#ffffff70" stroke="#54756930"/>)}
    {track.length > 0 && <polyline points={track.map(p => `${px(p.x)},${py(p.y)}`).join(" ")} fill="none" stroke="#98b989" strokeWidth={16}/>}
    {obstacles.map((p, i) => <g key={i}><rect x={p.x * size + 4} y={(height - p.y - 1) * size + 4} width={size - 8} height={size - 8} rx={8} fill="#526c61"/><text x={px(p.x)} y={py(p.y) + 7} textAnchor="middle" fontSize={22}>▧</text></g>)}
    {goal && <g><rect x={goal.x * size + 4} y={(height - goal.y - 1) * size + 4} width={size - 8} height={size - 8} rx={8} fill="#f6df8f"/><text x={px(goal.x)} y={py(goal.y) + 8} textAnchor="middle" fontSize={24}>★<title>Lesson destination</title></text></g>}
    {stops.map((p, i) => <text key={i} x={px(p.x)} y={py(p.y) + 5} textAnchor="middle" fill="#78531d">{i + 1}</text>)}
    {actors.map((actor, index) => { const here = actor.visits.at(-1); return <g key={actor.name}><polyline points={actor.visits.map(p => `${px(p.x)},${py(p.y)}`).join(" ")} fill="none" stroke={index % 2 ? "#9d4471" : "#24664e"} strokeWidth={4}/>{here && <text x={px(here.x)} y={py(here.y) + 10} textAnchor="middle" fontSize={28}>{token[location]}<title>{actor.name}: x={here.x}, y={here.y}</title></text>}</g>; })}
  </svg><p className="mt-2 text-xs text-emerald-950">The marked target and obstacles are the lesson’s actual data. Replaying this scene does not grant completion.</p></div>;
}
