type AdminSectionCardProps = {
  title: string;
  eyebrow?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export default function AdminSectionCard({ title, eyebrow, action, children, className = "" }: AdminSectionCardProps) {
  return (
    <section
      className={`rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)] p-5 ${className}`}
      style={{ background: "var(--admin-surface)", boxShadow: "var(--admin-shadow-sm)" }}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          {eyebrow ? <p className="admin-meta mb-1">{eyebrow}</p> : null}
          <h2 className="admin-section-title">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
