type AdminSectionCardProps = {
  title: string;
  eyebrow?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export default function AdminSectionCard({ title, eyebrow, action, children, className = "" }: AdminSectionCardProps) {
  return (
    <section className={`rounded-2xl border border-slate-700/60 bg-slate-900/78 p-5 shadow-xl shadow-slate-950/20 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          {eyebrow ? <p className="text-xs font-bold uppercase text-blue-300">{eyebrow}</p> : null}
          <h2 className="text-base font-extrabold text-white">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

