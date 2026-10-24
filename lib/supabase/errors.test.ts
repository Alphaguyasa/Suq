import { describe, expect, it } from 'vitest';
import { am } from '@/lib/i18n/am';
import { authErrorText, classifyAuthError } from './errors';

describe('classifyAuthError', () => {
  it('prefers the stable error code', () => {
    expect(classifyAuthError({ code: 'invalid_credentials', message: 'whatever' })).toBe('invalidCredentials');
    expect(classifyAuthError({ code: 'email_not_confirmed' })).toBe('emailNotConfirmed');
    expect(classifyAuthError({ code: 'weak_password' })).toBe('weakPassword');
    expect(classifyAuthError({ code: 'user_already_exists' })).toBe('alreadyRegistered');
    expect(classifyAuthError({ code: 'over_email_send_rate_limit' })).toBe('rateLimited');
  });

  it('knows a request that never reached the server', () => {
    expect(classifyAuthError({ name: 'AuthRetryableFetchError', message: '{}' })).toBe('network');
    expect(classifyAuthError({ message: 'TypeError: Failed to fetch' })).toBe('network');
  });

  it('falls back to the message when an older server sends no code', () => {
    expect(classifyAuthError({ message: 'Invalid login credentials' })).toBe('invalidCredentials');
    expect(classifyAuthError({ message: 'Password should be at least 6 characters.' })).toBe('weakPassword');
    expect(classifyAuthError({ message: 'User already registered' })).toBe('alreadyRegistered');
    expect(classifyAuthError({ message: 'Database error saving new user' })).toBe('unknown');
  });
});

describe('authErrorText', () => {
  it('shows only the translation for a known failure', () => {
    expect(authErrorText({ failure: 'invalidCredentials', raw: 'Invalid login credentials' }, am.auth.errors)).toBe(
      am.auth.errors.invalidCredentials,
    );
  });

  it('keeps the server text for an unknown one, for whoever helps the shop', () => {
    expect(authErrorText({ failure: 'unknown', raw: 'Database error' }, am.auth.errors)).toBe(
      `${am.auth.errors.unknown} (Database error)`,
    );
  });
});
