export function getLoginDisabledReason(email: string, password: string): string | null {
  if (!email.trim()) {
    return "Enter your email address to continue.";
  }

  if (!password) {
    return "Enter your password to continue.";
  }

  return null;
}