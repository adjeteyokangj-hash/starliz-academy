export type AdminNavItem = {
  title: string;
  href: string;
  icon: string;
  launchTag: "beta" | null;
};

export type AdminNavGroup = {
  title: string;
  items: readonly AdminNavItem[];
};

export const adminNavGroups: readonly AdminNavGroup[] = [
  {
    title: "Core Operations",
    items: [
      { title: "Dashboard", href: "/admin", icon: "D", launchTag: null },
      { title: "Students", href: "/admin/students", icon: "S", launchTag: null },
      { title: "Parents", href: "/admin/parents", icon: "P", launchTag: null },
      { title: "Schools", href: "/admin/schools", icon: "SC", launchTag: null },
      { title: "Reports", href: "/admin/reports", icon: "RP", launchTag: null },
    ],
  },
  {
    title: "Learning System",
    items: [
      { title: "Assignments", href: "/admin/assignments", icon: "AS", launchTag: null },
      { title: "Content Library", href: "/admin/content-library", icon: "CL", launchTag: null },
      { title: "Lessons", href: "/admin/lessons", icon: "L", launchTag: null },
      { title: "Dictionary / Word Bank", href: "/admin/dictionary", icon: "DW", launchTag: null },
    ],
  },
  {
    title: "Academic Intelligence",
    items: [
      { title: "Brain Centre", href: "/admin/brain-centre", icon: "BC", launchTag: "beta" },
      { title: "Knowledge Graph", href: "/admin/knowledge-graph", icon: "KG", launchTag: "beta" },
      { title: "Recovery Governance", href: "/admin/recovery-governance", icon: "RG", launchTag: "beta" },
      { title: "AI Generator", href: "/admin/ai", icon: "AI", launchTag: "beta" },
    ],
  },
  {
    title: "Communication",
    items: [
      { title: "Inbox", href: "/admin/inbox", icon: "IN", launchTag: null },
      { title: "Messages", href: "/admin/messages", icon: "MS", launchTag: null },
      { title: "Notifications", href: "/admin/notifications", icon: "N", launchTag: null },
      { title: "Support", href: "/admin/support", icon: "T", launchTag: null },
      { title: "Voice & Media", href: "/admin/voice-media", icon: "VM", launchTag: "beta" },
    ],
  },
  {
    title: "Rewards & Commerce",
    items: [
      { title: "Rewards", href: "/admin/rewards", icon: "R", launchTag: null },
      { title: "Store / Shop", href: "/admin/store", icon: "SH", launchTag: null },
      { title: "Subscriptions", href: "/admin/subscriptions", icon: "B", launchTag: null },
      { title: "Pricing", href: "/admin/pricing", icon: "PR", launchTag: null },
    ],
  },
  {
    title: "Business",
    items: [
      { title: "Trial Leads", href: "/admin/trial-leads", icon: "TL", launchTag: "beta" },
      { title: "TrueNumeris", href: "/admin/integrations/truenumeris", icon: "TN", launchTag: "beta" },
      { title: "Branding", href: "/admin/branding", icon: "BR", launchTag: null },
    ],
  },
  {
    title: "Platform",
    items: [
      { title: "Audit Logs", href: "/admin/audit-logs", icon: "A", launchTag: null },
      { title: "Settings", href: "/admin/settings", icon: "G", launchTag: null },
    ],
  },
] as const;

export const adminNavItems: AdminNavItem[] = adminNavGroups.flatMap((group) => [...group.items]);
