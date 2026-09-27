/** Supabase Auth's default minimum; stricter project rules are reported by the server. */
export const PASSWORD_MIN = 6;

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}
