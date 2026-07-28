import Link from "next/link";
import { redirect } from "next/navigation";
import { readSessionFromCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canDo, getSchoolRoleLabel } from "@/lib/schools/permissions";
import { requireSchoolAdminContext } from "@/lib/schools/portal-routing";
import CollapsibleCard from "@/components/school-admin/CollapsibleCard";

export const dynamic = "force-dynamic";

export default async function SchoolAdminSettingsPage() {
  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/school-admin/settings");

  const ctx = await requireSchoolAdminContext(session.userId);
  if (!ctx) redirect("/teacher");
  if (!canDo(ctx.role, "manageSchoolSettings") && !canDo(ctx.role, "viewDashboard")) {
    redirect("/school-admin");
  }

  const school = await prisma.school.findFirst({
    where: { id: ctx.schoolId, status: { not: "archived" } },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      type: true,
      contactEmail: true,
      licence: {
        select: {
          status: true,
          seatLimit: true,
          provider: true,
          billingInterval: true,
          currentPeriodEnd: true,
          trialEndsAt: true,
        },
      },
      _count: {
        select: {
          classrooms: true,
          teachers: { where: { status: { in: ["active", "invited"] } } },
          students: { where: { status: "active" } },
        },
      },
    },
  });

  if (!school) {
    return (
      <div className="mx-auto max-w-3xl p-6 lg:p-10">
        <h1 className="text-2xl font-bold text-foreground">School Settings</h1>
        <p className="mt-2 text-sm text-foreground/60">
          No active school workspace is linked to this account.
        </p>
      </div>
    );
  }

  const seatLimit = school.licence?.seatLimit ?? 0;
  const seatsUsed = school._count.students;
  const seatsDisplay = seatLimit === 0 ? `${seatsUsed} / unlimited` : `${seatsUsed} / ${seatLimit}`;
  const canSeeBilling = canDo(ctx.role, "viewBilling") || canDo(ctx.role, "manageLicence");
  const canManageOwnership = ctx.role === "owner";

  const shortcuts = [
    { href: "/school-admin/day-school/classes", label: "Classes", hint: "Manage classrooms" },
    { href: "/school-admin/day-school/teachers", label: "Teachers", hint: "Staff roster" },
    { href: "/school-admin/day-school/students", label: "Students", hint: "Enrolment" },
    { href: "/school-admin/short-learning/policies", label: "Short Learning policies", hint: "Booking windows and capacity" },
  ] as const;

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6 lg:p-10">
      <div>
        <h1 className="text-2xl font-bold text-foreground">School Settings</h1>
        <p className="mt-0.5 text-sm text-foreground/60">
          School identity, licence, and portal links for {school.name}. Your role:{" "}
          {getSchoolRoleLabel(ctx.role)}.
        </p>
      </div>

      <CollapsibleCard title="School snapshot" bodyClassName="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-foreground/50">Status</p>
          <p className="mt-1 text-lg font-semibold capitalize text-foreground">{school.status}</p>
        </article>
        {canSeeBilling ? (
          <article className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-foreground/50">Licence</p>
            <p className="mt-1 text-lg font-semibold capitalize text-foreground">
              {school.licence?.status ?? "none"}
            </p>
          </article>
        ) : null}
        {canSeeBilling ? (
          <article className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-foreground/50">Seats</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{seatsDisplay}</p>
          </article>
        ) : null}
        <article className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-foreground/50">Classes</p>
          <p className="mt-1 text-lg font-semibold text-foreground">{school._count.classrooms}</p>
        </article>
      </CollapsibleCard>

      <CollapsibleCard title="School identity" bodyClassName="p-5">
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
          <div>
            <dt className="text-foreground/50">Name</dt>
            <dd className="mt-0.5 font-medium text-foreground">{school.name}</dd>
          </div>
          <div>
            <dt className="text-foreground/50">Slug</dt>
            <dd className="mt-0.5 font-medium text-foreground">{school.slug}</dd>
          </div>
          <div>
            <dt className="text-foreground/50">Type</dt>
            <dd className="mt-0.5 font-medium capitalize text-foreground">{school.type}</dd>
          </div>
          <div>
            <dt className="text-foreground/50">Contact email</dt>
            <dd className="mt-0.5 font-medium text-foreground">{school.contactEmail ?? "—"}</dd>
          </div>
        </dl>
        {!canManageOwnership ? (
          <p className="mt-4 text-xs text-foreground/50">
            Ownership transfer and School Owner assignment are restricted to the School Owner.
          </p>
        ) : null}
      </CollapsibleCard>

      {canSeeBilling && school.licence ? (
        <CollapsibleCard title="Licence and billing" bodyClassName="p-5">
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-foreground/50">Provider</dt>
              <dd className="mt-0.5 font-medium text-foreground">{school.licence.provider}</dd>
            </div>
            <div>
              <dt className="text-foreground/50">Billing interval</dt>
              <dd className="mt-0.5 font-medium capitalize text-foreground">
                {school.licence.billingInterval ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-foreground/50">Current period end</dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {school.licence.currentPeriodEnd
                  ? school.licence.currentPeriodEnd.toLocaleDateString("en-GB")
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-foreground/50">Trial ends</dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {school.licence.trialEndsAt
                  ? school.licence.trialEndsAt.toLocaleDateString("en-GB")
                  : "—"}
              </dd>
            </div>
          </dl>
        </CollapsibleCard>
      ) : null}

      <CollapsibleCard title="Manage in School Portal" bodyClassName="p-5">
        <p className="mt-1 text-sm text-foreground/60">
          These stay inside the School Portal shell — they do not open the Teacher Portal.
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {shortcuts.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex flex-col rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted/40"
              >
                <span className="text-sm font-semibold text-foreground">{item.label}</span>
                <span className="text-xs text-foreground/50">{item.hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      </CollapsibleCard>
    </div>
  );
}