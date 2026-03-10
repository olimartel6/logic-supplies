import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit } from '@/lib/rate-limit';

describe('Rate Limiting', () => {
  // The rate-limit module uses an in-memory Map keyed by storeName.
  // To avoid cross-test contamination, use unique keys per test.

  it('allows requests within the limit', () => {
    const key = `test-ip-${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit('register-allow', key, 5, 60000);
      expect(result.allowed).toBe(true);
      expect(result.retryAfterMs).toBe(0);
    }
  });

  it('blocks the 6th request when limit is 5', () => {
    const key = `test-ip-${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit('register-block', key, 5, 60000);
      expect(result.allowed).toBe(true);
    }

    const blocked = checkRateLimit('register-block', key, 5, 60000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it('allows different keys independently', () => {
    const keyA = `ip-a-${Date.now()}`;
    const keyB = `ip-b-${Date.now()}`;
    const storeName = `register-independent-${Date.now()}`;

    // Fill up keyA
    for (let i = 0; i < 5; i++) {
      checkRateLimit(storeName, keyA, 5, 60000);
    }
    const blockedA = checkRateLimit(storeName, keyA, 5, 60000);
    expect(blockedA.allowed).toBe(false);

    // keyB should still be allowed
    const allowedB = checkRateLimit(storeName, keyB, 5, 60000);
    expect(allowedB.allowed).toBe(true);
  });
});
