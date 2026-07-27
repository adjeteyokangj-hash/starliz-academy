/** Durations Admin may author for Short Learning delivery-mode panel. */
export const SHORT_LEARNING_ADMIN_DURATIONS = [90, 120] as const;
export type ShortLearningAdminDuration = (typeof SHORT_LEARNING_ADMIN_DURATIONS)[number];
