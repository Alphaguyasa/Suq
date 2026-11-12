import { beforeEach, describe, expect, it, vi } from 'vitest';

const signOutMock = vi.fn();

vi.mock('./client', () => ({
  getSupabase: () => ({ auth: { signOut: signOutMock } }),
}));

const { signOut } = await import('./auth');

describe('signOut', () => {
  beforeEach(() => {
    signOutMock.mockReset();
  });

  it('signs out globally when the server accepts it', async () => {
    signOutMock.mockResolvedValue({ error: null });

    await signOut();

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledWith();
  });

  it('falls back to a local sign-out when the global one fails (offline till)', async () => {
    signOutMock
      .mockResolvedValueOnce({ error: { message: 'Failed to fetch' } })
      .mockResolvedValueOnce({ error: { message: 'Failed to fetch' } });

    await expect(signOut()).resolves.toBeUndefined();

    expect(signOutMock).toHaveBeenCalledTimes(2);
    expect(signOutMock).toHaveBeenLastCalledWith({ scope: 'local' });
  });

  it('does not reject when the local fallback throws', async () => {
    signOutMock
      .mockResolvedValueOnce({ error: { message: 'Service unavailable' } })
      .mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(signOut()).resolves.toBeUndefined();
  });
});
