type LaunchEnvCategory = {
  name: string;
  required: string[];
  optional?: string[];
};

export type LaunchEnvAuditCategoryResult = {
  name: string;
  present: string[];
  missingRequired: string[];
  missingOptional: string[];
};

export type LaunchEnvAuditResult = {
  ok: boolean;
  missingRequired: string[];
  categories: LaunchEnvAuditCategoryResult[];
};

function isEnabled(value: string | undefined): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function buildCategories(env: Record<string, string | undefined>): LaunchEnvCategory[] {
  const categories: LaunchEnvCategory[] = [
    {
      name: "core",
      required: ["DATABASE_URL", "AUTH_SECRET", "NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_BASE_URL", "CRON_SECRET"],
      optional: ["DIRECT_URL", "API_KEY_ENCRYPTION_SECRET"],
    },
    {
      name: "email",
      required: ["EMAIL_FROM"],
      optional: ["RESEND_API_KEY"],
    },
  ];

  if (isEnabled(env.BILLING_ENABLE_REVOLUT)) {
    categories.push({
      name: "billing:revolut",
      required: ["REVOLUT_MERCHANT_API_KEY", "REVOLUT_WEBHOOK_SECRET"],
      optional: ["REVOLUT_API_BASE_URL", "REVOLUT_ENVIRONMENT"],
    });
  }

  if (isEnabled(env.BILLING_ENABLE_PAYSTACK)) {
    categories.push({
      name: "billing:paystack",
      required: ["PAYSTACK_SECRET_KEY", "PAYSTACK_PUBLIC_KEY", "PAYSTACK_WEBHOOK_SECRET"],
      optional: ["PAYSTACK_ENVIRONMENT"],
    });
  }

  if (isEnabled(env.BILLING_ENABLE_STRIPE)) {
    categories.push({
      name: "billing:stripe",
      required: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
      optional: ["STRIPE_MONTHLY_PRICE_ID", "STRIPE_YEARLY_PRICE_ID", "STRIPE_SCHOOL_WEBHOOK_SECRET"],
    });
  }

  if (isEnabled(env.TRUENUMERIS_INTEGRATION_ENABLED)) {
    categories.push({
      name: "truenumeris",
      required: ["TRUENUMERIS_WEBHOOK_SECRET"],
      optional: ["TRUENUMERIS_DEFAULT_REGION", "TRUENUMERIS_REQUEST_TIMEOUT_MS"],
    });
  }

  return categories;
}

export function auditLaunchEnvironment(env: Record<string, string | undefined>): LaunchEnvAuditResult {
  const categories = buildCategories(env).map((category) => {
    const present = category.required.filter((key) => Boolean(env[key]?.trim()));
    const missingRequired = category.required.filter((key) => !env[key]?.trim());
    const missingOptional = (category.optional ?? []).filter((key) => !env[key]?.trim());

    return {
      name: category.name,
      present,
      missingRequired,
      missingOptional,
    };
  });

  const missingRequired = categories.flatMap((category) => category.missingRequired);

  return {
    ok: missingRequired.length === 0,
    missingRequired,
    categories,
  };
}