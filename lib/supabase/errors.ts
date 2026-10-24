/**
 * Why sign-in or sign-up failed, in terms the shopkeeper can act on.
 *
 * Supabase answers in English whatever the UI language, so its message is
 * never shown as the explanation. supabase-js puts a stable `code` on auth
 * errors (and `AuthRetryableFetchError` when the request never got through);
 * the message is only a fallback for older servers that send no code.
 */
export type AuthFailure =
  | 'invalidCredentials'
  | 'emailNotConfirmed'
  | 'weakPassword'
  | 'alreadyRegistered'
  | 'rateLimited'
  | 'network'
  | 'unknown';

/** Thrown by lib/supabase/auth.ts. `message` keeps the server's text for support. */
export class AuthFailureError extends Error {
  constructor(
    readonly failure: AuthFailure,
    message: string,
  ) {
    super(message);
    this.name = 'AuthFailureError';
  }
}

const BY_CODE: Record<string, AuthFailure> = {
  invalid_credentials: 'invalidCredentials',
  email_not_confirmed: 'emailNotConfirmed',
  weak_password: 'weakPassword',
  user_already_exists: 'alreadyRegistered',
  email_exists: 'alreadyRegistered',
  over_request_rate_limit: 'rateLimited',
  over_email_send_rate_limit: 'rateLimited',
};

export function classifyAuthError(error: { code?: unknown; name?: unknown; message?: unknown }): AuthFailure {
  if (typeof error.code === 'string' && BY_CODE[error.code]) return BY_CODE[error.code]!;
  if (error.name === 'AuthRetryableFetchError') return 'network';

  const message = typeof error.message === 'string' ? error.message : '';
  if (/invalid login credentials/i.test(message)) return 'invalidCredentials';
  if (/email not confirmed/i.test(message)) return 'emailNotConfirmed';
  if (/password should|weak password/i.test(message)) return 'weakPassword';
  if (/already registered|already exists/i.test(message)) return 'alreadyRegistered';
  if (/rate limit|too many/i.test(message)) return 'rateLimited';
  if (NETWORK.test(message)) return 'network';
  return 'unknown';
}

/** What each browser says when a fetch never reached the server. */
export const NETWORK =
  /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|err_network/i;

/**
 * The known failures speak for themselves. An unknown one keeps the server's
 * text in brackets, so whoever helps the shop can tell what happened.
 */
export function authErrorText(
  error: { failure: AuthFailure; raw: string },
  messages: Record<AuthFailure, string>,
): string {
  if (error.failure !== 'unknown' || !error.raw) return messages[error.failure];
  return `${messages.unknown} (${error.raw})`;
}
