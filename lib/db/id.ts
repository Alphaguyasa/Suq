/**
 * Every id is generated here, on the client, at creation time. We never wait
 * for a server to assign identity — that alone would break offline writes,
 * and it is what makes a retried push idempotent (BUILD_GUIDE 4.1).
 */
export function newId(): string {
  return crypto.randomUUID();
}

/** ISO timestamp for created_at / updated_at. */
export function nowIso(): string {
  return new Date().toISOString();
}
