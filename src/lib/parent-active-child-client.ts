type ActiveChildFetch = (
  input: string,
  init: {
    method: "POST";
    headers: { "Content-Type": "application/json" };
    credentials: "include";
    body: string;
  },
) => Promise<{ ok: boolean }>;

export async function persistParentActiveChild(
  childId: string,
  fetcher: ActiveChildFetch = fetch,
): Promise<boolean> {
  const response = await fetcher("/api/children/active", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ childId }),
  });

  return response.ok;
}
