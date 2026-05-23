import { NextResponse } from "next/server";
import type { ApiResponse, AuditEvent } from "./contracts";

type ErrorInput = {
  code: string;
  message: string;
};

type BuildResponseInput<T> = {
  success: boolean;
  data: T | null;
  error?: ErrorInput | null;
  validationErrors?: Array<{ field: string; message: string }>;
  auditEvent?: AuditEvent | null;
  requestedAt: string;
  status?: number;
};

export function buildResponse<T>(input: BuildResponseInput<T>) {
  const body: ApiResponse<T> = {
    success: input.success,
    data: input.data,
    error: input.error ?? null,
    validationErrors: input.validationErrors ?? [],
    auditEvent: input.auditEvent ?? null,
    timestamps: {
      requestedAt: input.requestedAt,
      respondedAt: new Date().toISOString(),
    },
  };

  return NextResponse.json(body, { status: input.status ?? (input.success ? 200 : 400) });
}

export function actorFromHeaders(request: Request): { actor: string; roleRaw: string | null } {
  const actor = request.headers.get("x-starliz-actor") ?? request.headers.get("x-actor") ?? "system";
  const roleRaw = request.headers.get("x-starliz-role") ?? request.headers.get("x-role");
  return { actor, roleRaw };
}
