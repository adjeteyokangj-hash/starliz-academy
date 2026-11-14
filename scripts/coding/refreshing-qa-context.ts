import type { APIRequestContext, APIResponse } from "@playwright/test";

/** Follow the application's ordinary refresh-cookie flow in long acceptance
 * runs. Never changes token lifetimes, permissions or subscription decisions. */
export function refreshingQaContext(context: APIRequestContext, base: string): APIRequestContext {
  return new Proxy(context, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (["get", "post", "put"].includes(String(property)) && typeof value === "function") return async (...args: unknown[]) => {
        const response = await Reflect.apply(value, target, args) as APIResponse;
        const path = args[0];
        if (response.status() !== 401 || typeof path !== "string" || path === "/api/auth/login" || path === "/api/auth/refresh") return response;
        const refresh = await target.post("/api/auth/refresh", { headers: { Origin: new URL(base).origin } });
        return refresh.status() === 200 ? await Reflect.apply(value, target, args) as APIResponse : response;
      };
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
