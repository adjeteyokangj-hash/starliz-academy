export function shouldBypassLearningAccessForAssignedSession(input: {
  pathname: string;
  assignmentId?: string | null;
  contentId?: string | null;
}): boolean {
  const isLearningGamePath = /^\/games\/(spelling|math|reading)(?:\/|$)/.test(input.pathname);
  return isLearningGamePath && Boolean(input.assignmentId || input.contentId);
}
