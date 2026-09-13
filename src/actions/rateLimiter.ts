/**
 * Per-client-IP rate limiting for server actions. Each action calls
 * createRateLimiter with its own key prefix so limits are independent, while
 * all limiters share the env-configured budget.
 */

import { headers } from 'next/headers';
import { RateLimiterMemory } from 'rate-limiter-flexible';

const RATE_LIMIT_MAX = parseInt(process.env.AUDIT_RATE_LIMIT_MAX || '5');
const RATE_LIMIT_WINDOW_S = Math.floor(
  parseInt(process.env.AUDIT_RATE_LIMIT_WINDOW_MS || '60000') / 1000,
);

/** Creates a limiter whose counters are namespaced by `keyPrefix`. */
export function createRateLimiter(keyPrefix: string): RateLimiterMemory {
  return new RateLimiterMemory({
    keyPrefix,
    points: RATE_LIMIT_MAX,
    duration: RATE_LIMIT_WINDOW_S,
  });
}

interface RateLimitRejection {
  msBeforeNext?: number;
}

/**
 * Consumes one point for the caller's IP. Resolves `allowed: false` with the
 * seconds to wait when the budget is exhausted; the IP falls back to
 * `'unknown'` outside a request scope.
 */
export async function checkRateLimit(
  limiter: RateLimiterMemory,
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  let clientIP = 'unknown';
  try {
    const headersList = await headers();
    clientIP = headersList.get('x-forwarded-for')?.split(',')[0]
      || headersList.get('x-real-ip')
      || 'unknown';
  } catch { /* non-critical in some contexts */ }

  try {
    await limiter.consume(clientIP);
    return { allowed: true };
  } catch (rejRes) {
    const rejection = rejRes as RateLimitRejection;
    return { allowed: false, retryAfterSeconds: Math.round((rejection.msBeforeNext ?? 60000) / 1000) };
  }
}
