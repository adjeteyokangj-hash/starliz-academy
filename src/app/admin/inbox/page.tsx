export default function AdminInboxPage() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center justify-center px-4 py-10">
      <section className="w-full rounded-3xl border border-slate-700/60 bg-slate-900/70 p-8 shadow-xl backdrop-blur-sm">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-400">Admin</p>
        <h1 className="mt-2 text-3xl font-black text-white">StarLiz Support Inbox</h1>

        <p className="mt-4 text-sm leading-relaxed text-slate-300">
          For now, manage support@starlizacademy.com directly in Microsoft Outlook while we complete the inbox sync.
        </p>

        <p className="mt-3 text-sm text-slate-400">Email inbox coming soon.</p>
        <p className="mt-1 text-sm text-slate-400">Use Microsoft 365 directly for now.</p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a
            href="https://outlook.office.com/mail/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white transition hover:bg-indigo-500"
          >
            Open Outlook
          </a>
        </div>

        <p className="mt-8 text-xs text-slate-500">Email sending is handled separately through Resend.</p>
      </section>
    </div>
  );
}
