import { Buffer } from "buffer";
import { generateR2ObjectKey, uploadFileToR2 } from "@/lib/r2-upload";

export async function storeCertificateExportHtml(input: {
  certificateNumber: string;
  html: string;
}): Promise<{ objectKey: string; publicUrl: string; mimeType: string; size: number }> {
  const fileName = `${input.certificateNumber || "certificate-export"}.html`;
  const objectKey = generateR2ObjectKey({
    folder: "certificates",
    originalFilename: fileName,
    mimeType: "text/html",
  });

  const body = Buffer.from(input.html, "utf8");
  const uploaded = await uploadFileToR2({
    objectKey,
    body,
    mimeType: "text/html; charset=utf-8",
    cacheControl: "public, max-age=86400",
  });

  return {
    objectKey: uploaded.objectKey,
    publicUrl: uploaded.publicUrl,
    mimeType: "text/html; charset=utf-8",
    size: body.byteLength,
  };
}
