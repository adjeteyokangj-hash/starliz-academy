"use client";

import type { ContentItem, ViewMode } from "./types";
import { getContentMeta } from "./utils";
import ContentCard from "./ContentCard";

type Props = {
  items: ContentItem[];
  selectedContentId: string | null;
  viewMode: ViewMode;
  onSelect: (item: ContentItem) => void;
  onView: (item: ContentItem) => void;
  onDuplicate: (item: ContentItem) => void;
  onArchive: (item: ContentItem) => void;
  onPublish: (item: ContentItem) => void;
};

export default function ContentTopicGrid({
  items,
  selectedContentId,
  onSelect,
  onView,
  onDuplicate,
  onArchive,
  onPublish,
  viewMode,
}: Props) {
  const grouped = items.reduce<Record<string, ContentItem[]>>((acc, item) => {
    const meta = getContentMeta(item);
    const key = `${meta.subject} / ${meta.topic || "General"}`;
    acc[key] = acc[key] ?? [];
    acc[key].push(item);
    return acc;
  }, {});

  const groups = Object.entries(grouped);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black text-white">Content by Topic</h2>
        <span className="text-xs font-bold text-slate-400">{items.length} result(s)</span>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-6 text-sm text-slate-400">No content found.</div>
      ) : null}

      {groups.map(([topic, topicItems]) => (
        <div key={topic} className="space-y-2">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{topic}</p>
          <div className={viewMode === "grid" ? "grid gap-3 xl:grid-cols-2" : "space-y-3"}>
            {topicItems.map((item) => (
              <ContentCard
                key={item.id}
                item={item}
                viewMode={viewMode}
                selected={selectedContentId === item.id}
                onSelect={onSelect}
                onView={onView}
                onDuplicate={onDuplicate}
                onArchive={onArchive}
                onPublish={onPublish}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
