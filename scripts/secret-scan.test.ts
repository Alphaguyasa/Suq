// @vitest-environment node
/**
 * The secret scanner in .githooks/pre-commit, run for real against a
 * throwaway git repository: once as the pre-commit hook git invokes, once in
 * the `--range` mode CI uses.
 *
 * The hook was committed without its executable bit for weeks, and git skips
 * a non-executable hook with only a hint, so every commit went through
 * unscanned. These tests commit through `git commit` (not `sh hook`) so a
 * lost bit fails them, and check the bit in the index so a fresh clone gets it.
 *
 * Fake keys are assembled at runtime: written out literally they would trip
 * the scanner on this file.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const HOOKS = join(ROOT, '.githooks');
const HOOK = join(HOOKS, 'pre-commit');

const FAKE_JWT = ['eyJ' + 'h'.repeat(12), 'eyJ' + 'p'.repeat(12), 'sig'].join('.');
const FAKE_SB_SECRET = 'sb_' + 'secret_' + 'x'.repeat(20);

// A clean environment: inside a hook or CI, GIT_DIR and friends would point
// git at the wrong repository.
const ENV = { ...process.env };
for (const key of Object.keys(ENV)) if (key.startsWith('GIT_')) delete ENV[key];

let repo: string;

function git(...args: string[]) {
  return execFileSync('git', args, { cwd: repo, env: ENV, encoding: 'utf8' }).trim();
}

/** Commits `content` to `file` through the hook; returns git's exit code and output. */
function commit(file: string, content: string) {
  writeFileSync(join(repo, file), content);
  git('add', '--', file);
  const run = spawnSync('git', ['commit', '-q', '-m', `add ${file}`], {
    cwd: repo,
    env: ENV,
    encoding: 'utf8',
  });
  return { code: run.status, out: run.stdout + run.stderr };
}

function scanRange(range: string) {
  const run = spawnSync('sh', [HOOK, '--range', range], { cwd: repo, env: ENV, encoding: 'utf8' });
  return { code: run.status, out: run.stdout + run.stderr };
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'suq-secret-scan-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.hooksPath', HOOKS);
  writeFileSync(join(repo, 'README.md'), 'base\n');
  git('add', 'README.md');
  git('commit', '-q', '--no-verify', '-m', 'base');
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('the hook file', () => {
  it('is committed executable, so git actually runs it', () => {
    const entry = execFileSync('git', ['ls-files', '-s', '.githooks/pre-commit'], {
      cwd: ROOT,
      env: ENV,
      encoding: 'utf8',
    });
    expect(entry.split(' ')[0]).toBe('100755');
  });

  it('is run by CI over every pull request and push', () => {
    const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
    expect(ci).toMatch(/sh \.githooks\/pre-commit --range /);
  });
});

describe('pre-commit (staged files)', () => {
  it('lets a clean commit through', () => {
    expect(commit('app.ts', 'export const x = 1;\n').code).toBe(0);
  });

  it('blocks a JWT-shaped key', () => {
    const run = commit('config.ts', `export const key = '${FAKE_JWT}';\n`);
    expect(run.code).not.toBe(0);
    expect(run.out).toContain("possible secret in 'config.ts'");
    expect(git('log', '--format=%s')).not.toContain('add config.ts');
  });

  it('blocks a Supabase secret key', () => {
    expect(commit('keys.txt', `${FAKE_SB_SECRET}\n`).code).not.toBe(0);
  });

  it('blocks a .env file but allows .env.example', () => {
    expect(commit('.env', 'NEXT_PUBLIC_SUPABASE_URL=x\n').code).not.toBe(0);
    git('reset', '-q');
    expect(commit('.env.example', 'NEXT_PUBLIC_SUPABASE_URL=\n').code).toBe(0);
  });

  it('does not flag code that only names the role', () => {
    expect(commit('grant.sql', 'grant select on t to service_role;\n').code).toBe(0);
  });
});

describe('--range (CI)', () => {
  it('passes a clean range', () => {
    const base = git('rev-parse', 'HEAD');
    commit('a.ts', 'export const a = 1;\n');
    commit('b.ts', 'export const b = 2;\n');
    expect(scanRange(`${base}..HEAD`).code).toBe(0);
  });

  it('fails on a key added and then deleted again within the range', () => {
    const base = git('rev-parse', 'HEAD');
    writeFileSync(join(repo, 'leak.ts'), `const k = '${FAKE_JWT}';\n`);
    git('add', 'leak.ts');
    git('commit', '-q', '--no-verify', '-m', 'leak');
    const leak = git('rev-parse', '--short', 'HEAD');
    commit('leak.ts', 'const k = process.env.KEY;\n');

    const run = scanRange(`${base}..HEAD`);
    expect(run.code).toBe(1);
    expect(run.out).toContain(`${leak} leak.ts:`);
  });

  it('fails on a committed .env file', () => {
    const base = git('rev-parse', 'HEAD');
    writeFileSync(join(repo, '.env.local'), 'X=1\n');
    git('add', '.env.local');
    git('commit', '-q', '--no-verify', '-m', 'env');
    expect(scanRange(`${base}..HEAD`).code).toBe(1);
  });

  it('ignores lines that were only removed', () => {
    writeFileSync(join(repo, 'old.ts'), `const k = '${FAKE_JWT}';\n`);
    git('add', 'old.ts');
    git('commit', '-q', '--no-verify', '-m', 'old leak');
    const base = git('rev-parse', 'HEAD');
    git('rm', '-q', 'old.ts');
    git('commit', '-q', '-m', 'remove');
    expect(scanRange(`${base}..HEAD`).code).toBe(0);
  });
});
