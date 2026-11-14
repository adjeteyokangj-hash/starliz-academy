/** Scope checks are shared by access and escalation; client period IDs grant no authority. */
export function codingPeriodMatches(input: {
  subject: string;
  periodClassroomId: string | null;
  learnerClassroomId: string | null;
}): boolean {
  return input.subject.trim().toLowerCase() === "coding"
    && (input.periodClassroomId === null || input.periodClassroomId === input.learnerClassroomId);
}
