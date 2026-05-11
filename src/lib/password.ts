/**
 * Generate a cryptographically secure strong password
 * Contains uppercase, lowercase, digits, and special characters
 * @param length Password length (default: 14)
 * @returns Generated password
 */
export function generatePassword(length = 14): string {
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%&*?";
  const groups = [lower, upper, digits, symbols];
  const all = groups.join("");

  const bytes = new Uint32Array(length + groups.length);
  crypto.getRandomValues(bytes);

  // Ensure at least one char from each group
  const required = groups.map((group, index) => group[bytes[index] % group.length]);
  // Fill remaining with random chars from all groups
  const remaining = Array.from(bytes.slice(groups.length), (value) =>
    all[value % all.length]
  );

  // Combine and shuffle
  const chars = [...required, ...remaining].slice(0, length);
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = bytes[i] % (i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }

  return chars.join("");
}
