/** Exact local playground only. Academic routes retain their normal gates. */
export function isDevelopmentCodingPlayground(pathname: string, environment = process.env.NODE_ENV): boolean {
  return environment === "development" && pathname === "/dev/coding";
}
