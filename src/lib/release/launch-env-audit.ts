type LaunchEnvCategory = {
  name: string;
  required: string[];
  optional?: string[];
};

type LaunchEnvAuditOptions = {
  strict?: boolean;
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

function buildCategories(env: Record<string, string | undefined>, options: LaunchEnvAuditOptions): LaunchEnvCategory[] {
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

  if (options.strict) {
    categories.push(
      {
        name: "storage:r2",
        required: [
          "CLOUDFLARE_R2_ENDPOINT",
          "CLOUDFLARE_R2_ACCESS_KEY_ID",
          "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
          "CLOUDFLARE_R2_BUCKET",
          "CLOUDFLARE_R2_PUBLIC_URL",
        ],
        optional: ["CLOUDFLARE_R2_REGION", "CLOUDFLARE_R2_ACCOUNT_ID"],
      },
      {
        name: "payments:webhook-policy",
        required: ["PAYMENT_WEBHOOK_ALLOW_FALLBACK_SIGNATURE"],
      },
      {
        name: "ops:delivery",
        required: [],
        optional: ["BACKUP_PROVIDER", "DATABASE_BACKUP_URL", "SENTRY_DSN", "MONITORING_DSN"],
      },
    );
  }

  return categories;
}

function hasAnyKey(env: Record<string, string | undefined>, keys: string[]): boolean {
  return keys.some((key) => Boolean(env[key]?.trim()));
}

export function auditLaunchEnvironment(env: Record<string, string | undefined>, options: LaunchEnvAuditOptions = {}): LaunchEnvAuditResult {
  const categories = buildCategories(env, options).map((category) => {
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

  if (options.strict) {
    if (!hasAnyKey(env, ["BACKUP_PROVIDER", "DATABASE_BACKUP_URL"])) {
      missingRequired.push("BACKUP_PROVIDER|DATABASE_BACKUP_URL");
    }
    if (!hasAnyKey(env, ["SENTRY_DSN", "MONITORING_DSN"])) {
      missingRequired.push("SENTRY_DSN|MONITORING_DSN");
    }
  }

  return {
    ok: missingRequired.length === 0,
    missingRequired,
    categories,
  };
}