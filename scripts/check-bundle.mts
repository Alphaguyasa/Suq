/**
 * `npm run check:bundle`
 *
 * Fails if real credential material reached the client bundle. Run after
 * `npm run build`; CI should treat a non-zero exit as a hard stop.
 *
 * It matches key VALUES, not the words around them. A naive grep for
 * "service_role" flags supabase-js's own key-type check and the guard in
 * lib/supabase/client.ts written to catch these keys — and a scanner that
 * cries wolf on correct code gets ignored, which is worse than no scanner.
 */
import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const BUNDLE_DIR = '.next/static';

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (/\.(js|css|map)$/.test(entry.name)) files.push(full);
  }

  return files;
}

function decodePayload(segment: string): Record<string, unknown> | null {
  try {
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

const findings: string[] = [];

for (const file of await walk(BUNDLE_DIR)) {
  const source = readFileSync(file, 'utf8');

  // 1. Any real JWT whose payload claims an elevated role.
  for (const match of source.matchAll(/eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\./g)) {
    const payload = decodePayload(match[1] as string);
    const role = payload?.role;

    if (role === 'service_role' || role === 'supabase_admin') {
      findings.push(`${file}: JWT with role "${String(role)}"`);
    }
  }

  // 2. A secret key with actual key characters after the prefix — as opposed
  //    to the bare literal used in a startsWith() comparison.
  for (const match of source.matchAll(/sb_secret_[A-Za-z0-9_-]{8,}/g)) {
    findings.push(`${file}: ${match[0].slice(0, 24)}...`);
  }

  // 3. A private key block has no business here at all.
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(source)) {
    findings.push(`${file}: PEM private key`);
  }
}

if (findings.length > 0) {
  console.error(`Credential material found in ${BUNDLE_DIR}:\n`);
  for (const finding of findings) console.error(`  - ${finding}`);
  console.error('\nThe service-role key bypasses every RLS policy. Do not ship this.');
  process.exit(1);
}

console.log(`No credential material in ${BUNDLE_DIR}. Only the anon/publishable key ships.`);
