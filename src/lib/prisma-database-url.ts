export function encodePostgresUserinfo(rawUrl: string): string {
  const match = rawUrl.match(/^(postgres(?:ql)?:\/\/)([^:/?#]+):(.+)@(.+)$/i);
  if (!match) return rawUrl;
  const [, protocol, user, password, rest] = match;
  return `${protocol}${encodeURIComponent(safeDecodeURIComponent(user))}:${encodeURIComponent(safeDecodeURIComponent(password))}@${rest}`;
}

export function normalizePrismaDatabaseUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return undefined;

  const encoded = encodePostgresUserinfo(rawUrl);
  try {
    const parsed = new URL(encoded);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== "postgres:" && protocol !== "postgresql:") {
      return encoded;
    }

    const persistentProcess = process.env.NODE_ENV !== "production" || !process.env.VERCEL;
    const currentLimit = Number(parsed.searchParams.get("connection_limit") || 0);
    if (persistentProcess) {
      parsed.searchParams.set("connection_limit", String(Math.max(currentLimit, 10)));
    } else if (!parsed.searchParams.has("connection_limit")) {
      parsed.searchParams.set("connection_limit", "1");
    }

    if (!parsed.searchParams.has("pool_timeout")) {
      parsed.searchParams.set("pool_timeout", "20");
    }

    const currentTimeout = Number(parsed.searchParams.get("connect_timeout") || 0);
    parsed.searchParams.set("connect_timeout", String(Math.max(currentTimeout, 30)));

    if (parsed.port === "6543" && !parsed.searchParams.has("pgbouncer")) {
      parsed.searchParams.set("pgbouncer", "true");
    }

    if (!parsed.searchParams.has("sslmode")) {
      parsed.searchParams.set("sslmode", "require");
    }

    return parsed.toString();
  } catch {
    return encoded;
  }
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
