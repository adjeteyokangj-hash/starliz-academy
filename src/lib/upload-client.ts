import type { UploadFolder } from "@/lib/r2-upload";

export type UploadedMedia = {
  ok: true;
  folder: UploadFolder;
  originalFilename: string;
  objectKey: string;
  publicUrl: string;
  mimeType: string;
  size: number;
};

export async function uploadMediaFile(file: File, folder: UploadFolder): Promise<UploadedMedia> {
  const form = new FormData();
  form.set("file", file);
  form.set("folder", folder);

  const response = await fetch("/api/upload", {
    method: "POST",
    body: form,
  });

  const payload = await response.json().catch(() => ({} as { error?: string }));
  if (!response.ok) {
    throw new Error(payload.error ?? "Upload failed.");
  }

  return payload as UploadedMedia;
}
