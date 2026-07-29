export type DiscoveryModule = {
  key: string;
  name: string;
  category: string;
  criticality: "HIGH" | "MEDIUM";
  routePrefixes: string[];
};

export type OpsWatchTopologyManifest = {
  schemaVersion: "1.0";
  source: "starliz-academy";
  application: {
    key: "starliz-academy";
    name: "StarLiz Academy";
  };
  modules: DiscoveryModule[];
};

const STARLIZ_DISCOVERY_MODULES: readonly DiscoveryModule[] = [
  {
    key: "public-website",
    name: "Public Website",
    category: "public",
    criticality: "HIGH",
    routePrefixes: ["/", "/uk", "/pricing", "/features", "/faq", "/policies", "/terms", "/privacy"]
  },
  {
    key: "parent-portal",
    name: "Parent Portal",
    category: "portal",
    criticality: "HIGH",
    routePrefixes: ["/parent", "/parent/dashboard", "/parent/messages", "/parent/support", "/parent/billing"]
  },
  {
    key: "student-portal",
    name: "Student Portal",
    category: "portal",
    criticality: "HIGH",
    routePrefixes: ["/student", "/student/dashboard", "/student/profile", "/student/today", "/student/attendance"]
  },
  {
    key: "teacher-portal",
    name: "Teacher Portal",
    category: "portal",
    criticality: "HIGH",
    routePrefixes: ["/teacher", "/teacher/assignments", "/teacher/classrooms", "/teacher/attendance", "/teacher/support"]
  },
  {
    key: "school-portal",
    name: "School Portal",
    category: "portal",
    criticality: "HIGH",
    routePrefixes: ["/school", "/school-admin"]
  },
  {
    key: "admin-portal",
    name: "Admin Portal",
    category: "portal",
    criticality: "HIGH",
    routePrefixes: ["/admin"]
  },
  {
    key: "day-school",
    name: "Day School",
    category: "education",
    criticality: "HIGH",
    routePrefixes: ["/school-admin/day-school", "/student/today", "/student/attendance"]
  },
  {
    key: "short-learning",
    name: "Short Learning",
    category: "education",
    criticality: "HIGH",
    routePrefixes: ["/school-admin/short-learning", "/parent/short-learning", "/student/short-learning"]
  },
  {
    key: "ai-tutor",
    name: "AI Tutor",
    category: "learning",
    criticality: "HIGH",
    routePrefixes: ["/games", "/games/lesson", "/ga-learning-hub", "/ai-use"]
  },
  {
    key: "content-library",
    name: "Content Library",
    category: "learning",
    criticality: "HIGH",
    routePrefixes: ["/admin/content-library", "/admin/dictionary", "/admin/lessons"]
  },
  {
    key: "payments",
    name: "Payments",
    category: "commerce",
    criticality: "HIGH",
    routePrefixes: ["/billing", "/subscription", "/parent/billing", "/admin/subscriptions", "/admin/pricing"]
  },
  {
    key: "communications",
    name: "Communications",
    category: "operations",
    criticality: "MEDIUM",
    routePrefixes: ["/admin/messages", "/admin/notifications", "/admin/support", "/parent/messages", "/parent/support"]
  },
  {
    key: "reporting",
    name: "Reporting",
    category: "operations",
    criticality: "MEDIUM",
    routePrefixes: ["/admin/reports", "/school-admin/day-school/reports"]
  },
  {
    key: "knowledge-centre",
    name: "Knowledge Centre",
    category: "learning",
    criticality: "MEDIUM",
    routePrefixes: ["/knowledge-centre", "/faq", "/policies"]
  },
  {
    key: "api-management",
    name: "API Management",
    category: "platform",
    criticality: "HIGH",
    routePrefixes: ["/admin/settings/api-management", "/api/external"]
  },
  {
    key: "authentication",
    name: "Authentication",
    category: "platform",
    criticality: "HIGH",
    routePrefixes: ["/auth/login", "/auth/forgot-password", "/signup"]
  }
] as const;

export function buildOpsWatchTopologyManifest(): OpsWatchTopologyManifest {
  return {
    schemaVersion: "1.0",
    source: "starliz-academy",
    application: {
      key: "starliz-academy",
      name: "StarLiz Academy"
    },
    modules: STARLIZ_DISCOVERY_MODULES.map((module) => ({
      ...module,
      routePrefixes: [...module.routePrefixes]
    }))
  };
}
