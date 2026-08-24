import { NextResponse, type NextRequest } from "next/server";
import { runSelfieCleanup } from "@/lib/cleanup";

export const dynamic = "force-dynamic";

/**
 * Scheduled photo-retention endpoint (Vercel Cron hits this daily).
 * Protected by CRON_SECRET; Vercel automatically sends
 * `Authorization: Bearer <CRON_SECRET>` for cron invocations.
 * Manual trigger from the admin panel uses an authenticated server action instead.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const auth = request.headers.get("authorization");
  const cronKey = request.headers.get("x-cleanup-key");

  if (auth !== `Bearer ${secret}` && cronKey !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await runSelfieCleanup();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
