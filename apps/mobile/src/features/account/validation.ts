import { emailSchema, passwordSchema } from '@aura/shared';
import { ApiError, isNetworkError } from '@/lib/api/client';

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export function validateEmail(email: string): string | null {
  if (!email.trim()) return 'Enter your email';
  return emailSchema.safeParse(email.trim()).success ? null : 'Enter a valid email address';
}

export function validateSignIn(input: { email: string; password: string }): FieldErrors<'email' | 'password'> {
  const errors: FieldErrors<'email' | 'password'> = {};
  const email = validateEmail(input.email);
  if (email) errors.email = email;
  if (!input.password) errors.password = 'Enter your password';
  return errors;
}

export function validateSignUp(input: { name: string; email: string; password: string; confirm?: string }): FieldErrors<'name' | 'email' | 'password' | 'confirm'> {
  const errors: FieldErrors<'name' | 'email' | 'password' | 'confirm'> = {};
  if (!input.name.trim()) errors.name = 'Tell us what to call you';
  else if (input.name.trim().length > 80) errors.name = 'Name is too long';
  const email = validateEmail(input.email);
  if (email) errors.email = email;
  const pw = passwordSchema.safeParse(input.password);
  if (!pw.success) errors.password = pw.error.issues[0]?.message ?? 'Invalid password';
  if (input.confirm !== undefined && input.confirm !== input.password) errors.confirm = "Passwords don't match";
  return errors;
}

export function hasErrors(errors: Record<string, string | undefined>): boolean {
  return Object.values(errors).some(Boolean);
}

/** Rough password strength for the sign-up meter: 0 (weak) – 3 (strong). */
export function passwordStrength(pw: string): 0 | 1 | 2 | 3 {
  if (pw.length < 8) return 0;
  let score = 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length >= 14) score = Math.min(3, score + 1);
  return Math.min(3, score) as 0 | 1 | 2 | 3;
}

/** Human message for auth failures. */
export function authErrorMessage(e: unknown): string {
  if (isNetworkError(e)) return "Can't reach the AURA server. Check your connection or the server address.";
  if (e instanceof ApiError) {
    if (e.status === 429) return 'Too many attempts. Please wait a minute and try again.';
    return e.message;
  }
  return e instanceof Error ? e.message : 'Something went wrong';
}
