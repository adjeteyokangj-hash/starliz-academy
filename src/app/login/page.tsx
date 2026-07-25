import { redirect } from "next/navigation";

type LoginRedirectProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginRedirectPage({ searchParams }: LoginRedirectProps) {
  const params = await searchParams;
  const qs = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      qs.set(key, value);
    } else if (Array.isArray(value)) {
      for (const entry of value) {
        qs.append(key, entry);
      }
    }
  }

  const query = qs.toString();
  redirect(query ? `/auth/login?${query}` : "/auth/login");
}
