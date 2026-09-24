import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /sw.js — the service worker, build-stamped.
 *
 * Why a route instead of a static file: `public/sw.js` would be served byte for
 * byte forever, so a returning user (including an installed phone PWA) could sit
 * on an old shell indefinitely. Here the cache name carries the Next build id,
 * and the response is explicitly revalidated, so the browser sees a changed
 * worker after every deploy, installs it, and `activate` drops the old cache.
 *
 * The worker source lives in `public/sw.template.js` (not served as /sw.js) so
 * there is exactly one copy of the logic; the Docker runner image already
 * includes `public/`, which is why the template is readable at runtime.
 */

const TEMPLATE = path.join(process.cwd(), "public", "sw.template.js");
const BUILD_ID_FILE = path.join(process.cwd(), ".next", "BUILD_ID");

async function currentBuildId(): Promise<string> {
  try {
    const id = (await readFile(BUILD_ID_FILE, "utf8")).trim();
    return id.length > 0 ? id : "unknown";
  } catch {
    // No build id on disk (e.g. `next dev`): a distinct name is still better
    // than sharing one with a real build.
    return "dev";
  }
}

export async function GET() {
  const buildId = await currentBuildId();

  let template: string;
  try {
    template = await readFile(TEMPLATE, "utf8");
  } catch (error) {
    console.error("[sw] could not read the service-worker template", error);
    return new Response("// service worker template missing", {
      status: 500,
      headers: { "content-type": "application/javascript; charset=utf-8" },
    });
  }

  const source = template.replace("__CACHE_NAME__", `phonemail-shell-${buildId}`);

  return new Response(source, {
    status: 200,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      // Revalidation-friendly: the browser must re-check the worker on every
      // navigation rather than trust a long-lived copy.
      "cache-control": "no-cache, must-revalidate",
      "service-worker-allowed": "/",
    },
  });
}
