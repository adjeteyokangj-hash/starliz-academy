type IntegrationToggleFieldProps = {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export default function IntegrationToggleField({ label, description, checked, onChange }: IntegrationToggleFieldProps) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-xl border border-slate-700/70 bg-slate-950/60 p-3">
      <span>
        <span className="block text-sm font-bold text-white">{label}</span>
        <span className="mt-0.5 block text-xs text-slate-400">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-500"
      />
    </label>
  );
}
