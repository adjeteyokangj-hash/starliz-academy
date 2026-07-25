import AdminResourceManager from "@/components/admin/AdminResourceManager";

export default function VoiceMediaPage() {
  return (
    <AdminResourceManager
      title="Voice & Media"
      description="Manage voice settings, audio prompts, image assets and pronunciation checks."
      resource="voice-media"
      primaryField="title"
      fields={[
        { name: "title", label: "Asset title" },
        { name: "type", label: "Type", type: "select", options: ["voice", "audio", "image", "prompt"] },
        { name: "status", label: "Status", type: "select", options: ["draft", "reviewed", "approved", "published"] },
        { name: "url", label: "URL" },
      ]}
    />
  );
}
