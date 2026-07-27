import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api_guard";
import { loadAdminAuthContext } from "@/lib/admin-permissions";
import { adminNavGroups } from "@/lib/admin-nav";

/**
 * Current platform Admin auth context for UI permission truthfulness.
 * Does not expose raw role permission arrays to ordinary restricted Admins beyond what they need.
 */
export async function GET() {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const context = await loadAdminAuthContext(session.userId);
  if (!context) {
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  }

  const can = {
    manageAdmins: context.isSuperAdmin || context.permissions.includes("MANAGE_ADMINS"),
    manageRoles: context.isSuperAdmin || context.permissions.includes("MANAGE_ROLES"),
    manageUsers: context.isSuperAdmin || context.permissions.includes("MANAGE_USERS"),
    manageSubscriptions: context.isSuperAdmin || context.permissions.includes("MANAGE_SUBSCRIPTIONS"),
    manageBilling: context.isSuperAdmin || context.permissions.includes("MANAGE_BILLING"),
    manageContent: context.isSuperAdmin || context.permissions.includes("MANAGE_CONTENT"),
    manageSettings: context.isSuperAdmin || context.permissions.includes("MANAGE_SETTINGS"),
    manageInbox: context.isSuperAdmin || context.permissions.includes("MANAGE_INBOX"),
    viewAuditLogs: context.isSuperAdmin || context.permissions.includes("VIEW_AUDIT_LOGS"),
    viewReports: context.isSuperAdmin || context.permissions.includes("VIEW_REPORTS"),
    viewPolicies:
      context.isSuperAdmin
      || context.permissions.includes("VIEW_POLICIES")
      || context.permissions.includes("MANAGE_POLICIES")
      || context.permissions.includes("APPROVE_POLICIES")
      || context.permissions.includes("PUBLISH_POLICIES")
      || context.permissions.includes("MANAGE_SETTINGS"),
    managePolicies: context.isSuperAdmin || context.permissions.includes("MANAGE_POLICIES"),
    approvePolicies: context.isSuperAdmin || context.permissions.includes("APPROVE_POLICIES"),
    publishPolicies: context.isSuperAdmin || context.permissions.includes("PUBLISH_POLICIES"),
  };

  const navVisibility: Record<string, boolean> = {
    "/admin": true,
    "/admin/students": can.manageUsers,
    "/admin/parents": can.manageUsers,
    "/admin/schools": can.manageUsers,
    "/admin/short-learning": can.manageUsers,
    "/admin/policy-library": can.viewPolicies,
    "/admin/reports": can.viewReports,
    "/admin/assignments": can.manageUsers || context.permissions.includes("MANAGE_ASSIGNMENTS"),
    "/admin/content-library": can.manageContent,
    "/admin/lessons": can.manageContent,
    "/admin/dictionary": can.manageContent,
    "/admin/ga-word-bank": can.manageContent,
    "/admin/ga-categories": can.manageContent,
    "/admin/ga-lessons": can.manageContent,
    "/admin/ga-voice": can.manageContent,
    "/admin/brain-centre": can.manageContent,
    "/admin/knowledge-graph": can.manageContent,
    "/admin/recovery-governance": can.manageContent,
    "/admin/ai-generator": can.manageContent,
    "/admin/inbox": can.manageInbox,
    "/admin/messages": can.manageInbox,
    "/admin/notifications": can.manageInbox,
    "/admin/support": can.manageInbox,
    "/admin/complaints": can.manageInbox,
    "/admin/voice-media": can.manageContent,
    "/admin/rewards": can.manageContent,
    "/admin/store": can.manageContent,
    "/admin/subscriptions": can.manageSubscriptions || can.manageBilling,
    "/admin/pricing": can.manageBilling || can.manageSubscriptions,
    "/admin/trial-leads": can.manageBilling,
    "/admin/integrations/truenumeris": can.manageBilling,
    "/admin/branding": context.permissions.includes("MANAGE_BRANDING") || context.isSuperAdmin,
    "/admin/audit-logs": can.viewAuditLogs,
    "/admin/settings": can.manageSettings || can.manageAdmins,
  };

  const visibleNav = adminNavGroups
    .map((group) => ({
      title: group.title,
      items: group.items.filter((item) => navVisibility[item.href] !== false),
    }))
    .filter((group) => group.items.length > 0);

  return NextResponse.json({
    userId: context.userId,
    email: context.email,
    roleName: context.roleName,
    isSuperAdmin: context.isSuperAdmin,
    hasValidRole: Boolean(context.roleId && context.roleName),
    can,
    visibleNav,
  });
}
