export type AdminSectionAnchor = {
  id: string;
  label: string;
  expand?: () => void;
  highlight?: () => void;
};

export type AdminSectionAnchorRegistry = {
  register: (anchor: AdminSectionAnchor) => () => void;
  unregister: (id: string) => void;
  resolve: (id: string) => AdminSectionAnchor | null;
  list: () => AdminSectionAnchor[];
};

export function createAdminSectionAnchorRegistry(): AdminSectionAnchorRegistry {
  const anchors = new Map<string, AdminSectionAnchor>();

  return {
    register(anchor) {
      anchors.set(anchor.id, anchor);
      return () => {
        const current = anchors.get(anchor.id);
        if (current === anchor) {
          anchors.delete(anchor.id);
        }
      };
    },
    unregister(id) {
      anchors.delete(id);
    },
    resolve(id) {
      return anchors.get(id) ?? null;
    },
    list() {
      return Array.from(anchors.values());
    },
  };
}
