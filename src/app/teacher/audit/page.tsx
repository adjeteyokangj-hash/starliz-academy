import { redirect } from "next/navigation";
import Link from "next/link";
import { readSessionFromCookie } from "@/lib/auth";
import { getSchoolTeacherContext, canDo } from "@/lib/schools/rbac";
import { prisma } from "@/lib/db";

type TabKey = "audit" | "access" | "licence" | "safeguarding";

export default async function TeacherAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/teacher/audit");

  const ctx = await getSchoolTeacherContext(session.userId);
  if (!ctx) redirect("/dashboard");
  if (!canDo(ctx.role, "viewAuditLog")) redirect("/teacher");

  const sp = await searchParams;
  const tab: TabKey =
    sp.tab === "access" || sp.tab === "licence" || sp.tab === "safeguarding"
      ? sp.tab
      : "audit";

  const schoolId = ctx.schoolId;

  // ── Data fetching per tab ────────────────────────────────────────────────
  const [auditLogs, accessDenials, licenceEvents, safeguardingAlerts] = await Promise.all([
    tab === "audit"
      ? prisma.schoolAuditLog.findMany({
          where: { schoolId },
          orderBy: { createdAt: "desc" },
          take: 100,
        })
      : Promise.resolve([]),

    tab === "access"
      ? prisma.schoolAccessLog.findMany({
          where: { schoolId, success: false },
          orderBy: { createdAt: "desc" },
          take: 100,
        })
      : Promise.resolve([]),

    tab === "licence"
      ? prisma.licenceEvent.findMany({
          where: { schoolId },
          orderBy: { createdAt: "desc" },
          take: 100,
        })
      : Promise.resolve([]),

    tab === "safeguarding"
      ? prisma.schoolSafeguardingAlert.findMany({
          where: { schoolId },
          orderBy: { createdAt: "desc" },
          take: 100,
          include: { student: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);

  // ── Badge counts for tab labels ──────────────────────────────────────────
  const [accessDenialCount, openSafeguardingCount] = await Promise.all([
    prisma.schoolAccessLog.count({ where: { schoolId, success: false } }),
    prisma.schoolSafeguardingAlert.count({
      where: { schoolId, status: { in: ["open", "under_review"] } },
    }),
  ]);

  // ── Styles ───────────────────────────────────────────────────────────────
  const severityStyle: Record<string, string> = {
    info: "bg-muted/60 text-foreground/70",
    warning: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    critical: "bg-destructive/10 text-destructive",
    low: "bg-muted/60 text-foreground/70",
    medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  };

  const tabs: { key: TabKey; label: string; badge?: number }[] = [
    { key: "audit", label: "Audit Log" },
    { key: "access", label: "Access Denials", badge: accessDenialCount },
    { key: "licence", label: "Licence Events" },
    { key: "safeguarding", label: "Safeguarding", badge: openSafeguardingCount },
  ];

  function fmt(d: Date) {
    return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">School Security &amp; Audit</h1>
        <p className="mt-0.5 text-sm text-foreground/60">Last 100 records · {ctx.schoolName}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/teacher/audit?tab=${t.key}`}
            className={`relative flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition rounded-t-lg
              ${tab === t.key
                ? "border-b-2 border-primary text-primary bg-primary/5"
                : "text-foreground/60 hover:text-foreground hover:bg-muted/40"
              }`}
          >
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className="ml-1 rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">
                {t.badge > 99 ? "99+" : t.badge}
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* ── Tab: Audit Log ── */}
      {tab === "audit" && (
        auditLogs.length === 0 ? (
          <Empty text="No audit events yet." />
        ) : (
          <Table>
            <thead className="bg-muted/40 text-xs text-foreground/60">
              <tr>
                <Th>When</Th>
                <Th>Action</Th>
                <Th>Entity</Th>
                <Th>Severity</Th>
                <Th>Actor</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {auditLogs.map((log) => (
                <tr key={log.id} className="hover:bg-muted/20 transition-colors">
                  <Td mono>{fmt(log.createdAt)}</Td>
                  <Td mono>{log.action}</Td>
                  <Td>
                    {log.entityType}
                    {log.entityId && <Subtle>·{log.entityId.slice(-8)}</Subtle>}
                  </Td>
                  <Td><Badge cls={severityStyle[log.severity]}>{log.severity}</Badge></Td>
                  <Td mono>{log.actorUserId?.slice(-8) ?? "system"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )
      )}

      {/* ── Tab: Access Denials ── */}
      {tab === "access" && (
        accessDenials.length === 0 ? (
          <Empty text="No access denials recorded." />
        ) : (
          <Table>
            <thead className="bg-muted/40 text-xs text-foreground/60">
              <tr>
                <Th>When</Th>
                <Th>Route</Th>
                <Th>Method</Th>
                <Th>Reason</Th>
                <Th>IP</Th>
                <Th>User</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {accessDenials.map((log) => (
                <tr key={log.id} className="hover:bg-muted/20 transition-colors">
                  <Td mono>{fmt(log.createdAt)}</Td>
                  <Td mono>{log.route}</Td>
                  <Td mono>{log.method}</Td>
                  <Td><Badge cls="bg-destructive/10 text-destructive">{log.denialReason ?? "denied"}</Badge></Td>
                  <Td mono>{log.ipAddress ?? "—"}</Td>
                  <Td mono>{log.userId.slice(-8)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )
      )}

      {/* ── Tab: Licence Events ── */}
      {tab === "licence" && (
        licenceEvents.length === 0 ? (
          <Empty text="No licence events recorded." />
        ) : (
          <Table>
            <thead className="bg-muted/40 text-xs text-foreground/60">
              <tr>
                <Th>When</Th>
                <Th>Event</Th>
                <Th>Previous Status</Th>
                <Th>New Status</Th>
                <Th>Actor</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {licenceEvents.map((ev) => (
                <tr key={ev.id} className="hover:bg-muted/20 transition-colors">
                  <Td mono>{fmt(ev.createdAt)}</Td>
                  <Td mono>{ev.eventType}</Td>
                  <Td>{ev.previousStatus ?? "—"}</Td>
                  <Td>
                    {ev.nextStatus ? (
                      <Badge cls={ev.nextStatus === "suspended" ? "bg-destructive/10 text-destructive" : "bg-muted/60 text-foreground/70"}>
                        {ev.nextStatus}
                      </Badge>
                    ) : "—"}
                  </Td>
                  <Td mono>{ev.actorUserId?.slice(-8) ?? "cron"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )
      )}

      {/* ── Tab: Safeguarding ── */}
      {tab === "safeguarding" && (
        safeguardingAlerts.length === 0 ? (
          <Empty text="No safeguarding alerts." />
        ) : (
          <Table>
            <thead className="bg-muted/40 text-xs text-foreground/60">
              <tr>
                <Th>When</Th>
                <Th>Category</Th>
                <Th>Severity</Th>
                <Th>Status</Th>
                <Th>Triggered by</Th>
                <Th>Student</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {safeguardingAlerts.map((alert) => (
                <tr key={alert.id} className="hover:bg-muted/20 transition-colors">
                  <Td mono>{fmt(alert.createdAt)}</Td>
                  <Td>{alert.category}</Td>
                  <Td><Badge cls={severityStyle[alert.severity] ?? ""}>{alert.severity}</Badge></Td>
                  <Td>
                    <Badge cls={alert.status === "open" ? "bg-destructive/10 text-destructive" : alert.status === "resolved" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-muted/60 text-foreground/70"}>
                      {alert.status}
                    </Badge>
                  </Td>
                  <Td mono>{alert.triggeredBy}</Td>
                  <Td>{alert.student?.name ?? <Subtle>unknown</Subtle>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )
      )}
    </div>
  );
}

// ── Micro-components ──────────────────────────────────────────────────────

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
      <p className="text-foreground/50">{text}</p>
    </div>
  );
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card overflow-x-auto">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2 text-left font-medium">{children}</th>;
}

function Td({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <td className={`px-4 py-2 text-xs whitespace-nowrap ${mono ? "font-mono text-foreground/60" : "text-foreground/80"}`}>
      {children}
    </td>
  );
}

function Badge({ children, cls }: { children: React.ReactNode; cls?: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls ?? ""}`}>{children}</span>
  );
}

function Subtle({ children }: { children: React.ReactNode }) {
  return <span className="ml-1 font-mono text-foreground/40">{children}</span>;
}
