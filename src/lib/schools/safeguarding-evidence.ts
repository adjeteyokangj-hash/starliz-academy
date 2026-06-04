export type SafeguardingEvidenceAttachmentView = {
  id: string;
  label: string;
  originalName: string;
  downloadUrl: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  note: string | null;
  createdAt: string;
  uploadedBy?: unknown;
};

export type SafeguardingEvidenceAttachmentRecord = {
  id: string;
  schoolId: string;
  incidentId: string;
  label: string;
  originalName: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  note: string | null;
  createdAt: Date;
  uploadedBy?: unknown;
};

function pathPart(value: string): string {
  return encodeURIComponent(value);
}

export function buildSafeguardingEvidenceDownloadUrl(input: {
  schoolId: string;
  incidentId: string;
  attachmentId: string;
}): string {
  return `/api/school/safeguarding/${pathPart(input.schoolId)}/incidents/${pathPart(input.incidentId)}/attachments/${pathPart(input.attachmentId)}/download`;
}

export function toSafeguardingEvidenceAttachmentView(
  attachment: SafeguardingEvidenceAttachmentRecord,
): SafeguardingEvidenceAttachmentView {
  return {
    id: attachment.id,
    label: attachment.label,
    originalName: attachment.originalName,
    downloadUrl: buildSafeguardingEvidenceDownloadUrl({
      schoolId: attachment.schoolId,
      incidentId: attachment.incidentId,
      attachmentId: attachment.id,
    }),
    mimeType: attachment.mimeType,
    fileSizeBytes: attachment.fileSizeBytes,
    note: attachment.note,
    createdAt: attachment.createdAt.toISOString(),
    ...(attachment.uploadedBy === undefined ? {} : { uploadedBy: attachment.uploadedBy }),
  };
}
