import type { Json } from "@/lib/coding/learning/types";

export default function SavedValues({ value }: { value: Json }) {
  if (Array.isArray(value)) {
    return value.length ? <ol className="list-decimal space-y-1 pl-5">{value.map((item, index) => <li key={index}><SavedValues value={item} /></li>)}</ol> : <span>None</span>;
  }
  if (value && typeof value === "object") {
    const fields = Object.entries(value).filter(([key]) => !/(^id$|Id$|hash|fingerprint|schema|^type$|^version$)/i.test(key));
    return fields.length ? <dl className="space-y-1">{fields.map(([key, item]) => (
      <div key={key}>
        <dt className="font-semibold">{key.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ")}</dt>
        <dd className="pl-3"><SavedValues value={item} /></dd>
      </div>
    ))}</dl> : <span>None</span>;
  }
  if (typeof value === "string" && /^[a-f\d]{64}$/i.test(value)) return null;
  return <span className="whitespace-pre-wrap wrap-anywhere">{value === null ? "None" : typeof value === "boolean" ? value ? "Yes" : "No" : value}</span>;
}
