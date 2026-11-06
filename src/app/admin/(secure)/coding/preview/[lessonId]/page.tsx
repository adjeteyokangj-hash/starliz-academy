import CurriculumDraftPreview from "@/components/coding/CurriculumDraftPreview";

export default async function CodingPreviewPage({ params }: { params: Promise<{ lessonId: string }> }) {
  return <CurriculumDraftPreview lessonId={(await params).lessonId} />;
}
