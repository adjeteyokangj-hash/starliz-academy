function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export function buildWeeklyProgressEmail(data: {
  parentName?: string | null;
  childName: string;
  improvements: string[];
  totalAttempts: number;
  accuracy: number;
  focusAreas: string[];
}) {
  const appUrl = getAppUrl();
  const greeting = data.parentName?.trim() ? `Hi ${data.parentName},` : "Hi there,";
  const focusList = data.focusAreas.length
    ? `<p>Recommended focus for next week: ${data.focusAreas.join(", ")}.</p>`
    : "";

  return {
    subject: `${data.childName}'s learning update`,
    html: `
      <p>${greeting}</p>
      <h2>Great progress this week</h2>
      <p>${data.childName} completed ${data.totalAttempts} learning activities with ${data.accuracy}% accuracy.</p>
      <p>${data.childName} is improving in:</p>
      <ul>
        ${data.improvements.map((item) => `<li>${item}</li>`).join("")}
      </ul>
      ${focusList}
      <p>Keep it up!</p>
      <a href="${appUrl}/parent">
        View full progress
      </a>
    `,
    text: `${greeting}\n\n${data.childName} completed ${data.totalAttempts} activities this week with ${data.accuracy}% accuracy. Improving in: ${data.improvements.join(", ") || "general practice"}.${data.focusAreas.length ? ` Focus next on ${data.focusAreas.join(", ")}.` : ""}\n\nView full progress: ${appUrl}/parent`,
  };
}