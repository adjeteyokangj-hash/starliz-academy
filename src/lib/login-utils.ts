export function getLoginDisabledReason(identifier: string, password: string): string | null {
  if (!identifier.trim()) {
    return "Enter your email or username to continue.";
  }

  if (!password) {
    return "Enter your password to continue.";
  }

  return null;
}