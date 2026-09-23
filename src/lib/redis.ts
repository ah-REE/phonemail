import { createClient } from "redis";

/**
 * Redis client singleton (node-redis v4 API).
 *
 * Two deliberate properties:
 *  - importing this module opens NO socket, so Next.js can load a route that
 *    imports it even when Redis is down (or not yet started);
 *  - the client is cached on `globalThis`, so hot reloads reuse one client.
 *
 * Call `getRedis()` anywhere you need a connected client; it connects on first
 * use and is safe to call concurrently.
 */

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

/**
 * Bound the connect attempt. Without this, node-redis retries forever and an
 * API route that needs Redis hangs instead of returning an error the caller
 * can act on. Worst case here is ~3s before the route reports the outage.
 */
const CONNECT_TIMEOUT_MS = 3000;
const MAX_CONNECT_RETRIES = 4;

type RedisClient = ReturnType<typeof createClient>;

declare global {
  // eslint-disable-next-line no-var
  var __phonemailRedis: RedisClient | undefined;
  // eslint-disable-next-line no-var
  var __phonemailRedisConnect: Promise<RedisClient> | undefined;
}

function createRedisClient(): RedisClient {
  const client = createClient({
    url: REDIS_URL,
    socket: {
      connectTimeout: CONNECT_TIMEOUT_MS,
      reconnectStrategy: (retries: number) =>
        retries >= MAX_CONNECT_RETRIES
          ? new Error(`Redis is not reachable at ${REDIS_URL}`)
          : Math.min(100 * 2 ** retries, 1000),
    },
  });

  client.on("error", (error: unknown) => {
    console.error("[redis] client error", error);
  });

  return client;
}

/** Returns a connected Redis client. Connects lazily and idempotently. */
export async function getRedis(): Promise<RedisClient> {
  const existing = globalThis.__phonemailRedis;
  if (existing?.isOpen) {
    return existing;
  }

  // Collapse concurrent first-callers onto one connect attempt.
  if (!globalThis.__phonemailRedisConnect) {
    globalThis.__phonemailRedisConnect = (async () => {
      const client = existing ?? createRedisClient();
      globalThis.__phonemailRedis = client;
      try {
        await client.connect();
        return client;
      } catch (error) {
        // Never cache a client that failed to connect: the next request should
        // get a clean attempt rather than inherit a broken socket.
        try {
          if (client.isOpen) {
            await client.disconnect();
          }
        } catch {
          // ignore cleanup failure
        }
        globalThis.__phonemailRedis = undefined;
        throw error;
      } finally {
        globalThis.__phonemailRedisConnect = undefined;
      }
    })();
  }

  return globalThis.__phonemailRedisConnect;
}

export default getRedis;
