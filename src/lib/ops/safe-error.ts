import { redactSensitiveLogData } from "@/lib/ops/log-redaction";

export type SafeApiErrorBody = {
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
  details?: Record<string, unknown>;
};

type BuildSafeApiErrorOptions = {
  code: string;
  message: string;
  requestId?: string;
  details?: Record<string, unknown>;
};

export function buildSafeApiError(options: BuildSafeApiErrorOptions): SafeApiErrorBody {
  return {
    error: {
      code: options.code,
      message: options.message,
      requestId: options.requestId,
    },
    details: options.details ? redactSensitiveLogData(options.details) : undefined,
  };
}
