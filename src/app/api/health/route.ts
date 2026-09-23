import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness/readiness endpoint. The Compose healthcheck for the `app` service
 * polls this, so it must be dependency-free: no DB and no Redis access here,
 * otherwise a healthy app would be reported unhealthy during a DB blip.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "phonemail-app",
      time: new Date().toISOString(),
    },
    { status: 200 },
  );
}
