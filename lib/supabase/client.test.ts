import { describe, expect, it } from 'vitest';
import { isServiceRoleKey } from './client';

/** Payload {"role":"service_role"} — a real one of these must never ship. */
function jwtWithRole(role: string): string {
  const payload = Buffer.from(JSON.stringify({ iss: 'supabase', role })).toString('base64url');
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.signature`;
}

describe('isServiceRoleKey', () => {
  it('catches a service-role JWT', () => {
    expect(isServiceRoleKey(jwtWithRole('service_role'))).toBe(true);
  });

  it('catches a modern secret key by prefix', () => {
    expect(isServiceRoleKey('sb_secret_abc123')).toBe(true);
  });

  it('passes the keys that are meant to ship', () => {
    expect(isServiceRoleKey(jwtWithRole('anon'))).toBe(false);
    expect(isServiceRoleKey('sb_publishable_P_EjSESCNhqFSDCQGr6lZQ__l3_RR-8')).toBe(false);
  });

  it('does not crash on junk', () => {
    expect(isServiceRoleKey('')).toBe(false);
    expect(isServiceRoleKey('not.a.jwt')).toBe(false);
    expect(isServiceRoleKey('a.b')).toBe(false);
  });
});
