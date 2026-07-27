/**
 * Client-safe upload error mapping for Bulk Educational Content Import.
 * Never include signed URLs, object keys, or credentials in these messages.
 */

export type UploadFailureStage =
  | "create_session"
  | "r2_put"
  | "r2_preflight"
  | "verify"
  | "analyse"
  | "cancelled"
  | "provider";

export type MappedUploadError = {
  stage: UploadFailureStage;
  message: string;
  fileName?: string;
  code: string;
};

/** Normalise browser ZIP/Office MIME quirks so signed Content-Type matches the PUT. */
export function normalizeLessonPackMimeType(fileName: string, mimeType?: string | null): string {
  const name = fileName.toLowerCase();
  const raw = (mimeType ?? "").trim().toLowerCase();
  if (name.endsWith(".zip") || raw.includes("zip")) return "application/zip";
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (name.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (name.endsWith(".doc")) return "application/msword";
  if (name.endsWith(".txt")) return "text/plain";
  if (raw && raw !== "application/octet-stream") return raw;
  return "application/octet-stream";
}

export function mapUploadFailure(input: {
  stage: UploadFailureStage;
  error: unknown;
  fileName?: string;
  httpStatus?: number;
}): MappedUploadError {
  const raw = input.error instanceof Error ? input.error.message : String(input.error ?? "Upload failed");
  const fileName = input.fileName;
  const status = input.httpStatus;

  if (input.stage === "cancelled" || /cancel/i.test(raw)) {
    return { stage: "cancelled", message: "Upload cancelled.", code: "upload_cancelled" };
  }

  if (input.stage === "provider" || /R2 is not configured/i.test(raw)) {
    return {
      stage: "provider",
      message: "Cloudflare R2 is not configured for deployed lesson-pack uploads.",
      code: "r2_not_configured",
    };
  }

  if (input.stage === "create_session") {
    return {
      stage: "create_session",
      message: raw || "Could not create the private upload session.",
      code: "session_create_failed",
    };
  }

  // XHR status 0 / generic network text ⇒ CORS/preflight or connectivity to R2
  if (
    input.stage === "r2_put"
    || input.stage === "r2_preflight"
    || /network error during upload/i.test(raw)
    || status === 0
  ) {
    const label = fileName ? `Upload failed for ${fileName}.` : "Upload failed.";
    if (/network error|failed to fetch|cors|preflight|status\s*0/i.test(raw) || status === 0) {
      return {
        stage: "r2_preflight",
        message: `${label} Cloudflare R2 rejected the upload preflight. Confirm bucket CORS allows PUT from this Admin origin with Content-Type.`,
        fileName,
        code: "r2_cors_or_network",
      };
    }
    if (/403|signature|access denied/i.test(raw) || status === 403) {
      return {
        stage: "r2_put",
        message: `${label} The signed upload authorisation was rejected. Retry the upload.`,
        fileName,
        code: "r2_signature_rejected",
      };
    }
    if (/401|expired/i.test(raw) || status === 401) {
      return {
        stage: "r2_put",
        message: `${label} The signed upload authorisation expired. Retry the upload.`,
        fileName,
        code: "r2_url_expired",
      };
    }
    return {
      stage: "r2_put",
      message: fileName ? `Upload failed for ${fileName}.` : (raw || "Upload failed."),
      fileName,
      code: status ? `r2_http_${status}` : "r2_put_failed",
    };
  }

  if (input.stage === "verify") {
    return {
      stage: "verify",
      message: raw || "Upload completed, but server verification failed.",
      code: "verify_failed",
    };
  }

  if (input.stage === "analyse") {
    return {
      stage: "analyse",
      message: raw || "Analysis could not start after upload verification.",
      code: "analyse_failed",
    };
  }

  return {
    stage: input.stage,
    message: raw || "Upload failed.",
    fileName,
    code: "upload_failed",
  };
}

/** Recommended R2 CORS policy shape for the lesson-pack private bucket (not public-read). */
export const LESSON_PACK_R2_CORS_POLICY = [
  {
    AllowedOrigins: [
      "https://REPLACE_WITH_DEPLOYED_ADMIN_ORIGIN",
    ],
    AllowedMethods: ["PUT", "GET", "HEAD", "DELETE"],
    AllowedHeaders: [
      "Content-Type",
      "Content-Length",
      "x-amz-content-sha256",
      "x-amz-date",
      "x-amz-security-token",
      "x-amz-checksum-crc32",
      "x-amz-checksum-crc32c",
      "x-amz-checksum-sha1",
      "x-amz-checksum-sha256",
      "x-amz-sdk-checksum-algorithm",
      "authorization",
    ],
    ExposeHeaders: ["ETag", "Content-Length", "Content-Type"],
    MaxAgeSeconds: 3600,
  },
] as const;

export const UPLOAD_PUT_CONCURRENCY = 2;
