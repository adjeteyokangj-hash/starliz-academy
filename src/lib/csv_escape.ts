export function csvEscape(value: string | number | boolean): string {
  const str = String(value).replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  return /[",\n]/.test(str) ? `"${str.replaceAll("\"", "\"\"")}"` : str;
}
