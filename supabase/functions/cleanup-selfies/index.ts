// گاهان — Edge Function: cleanup-selfies
// Deletes selfie files older than the configured retention period (default 30 days)
// from Storage while KEEPING the attendance database records intact.
// Deploy: supabase functions deploy cleanup-selfies
// Secret: supabase secrets set CLEANUP_SECRET=...
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = { "Content-Type": "application/json" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req: Request) => {
  try {
    const secret = Deno.env.get("CLEANUP_SECRET");
    if (!secret || req.headers.get("x-cleanup-key") !== secret) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const result = await runCleanup(admin);
    return json({ ok: true, ...result });
  } catch (err) {
    console.error("[cleanup-selfies]", err);
    return json({ ok: false, error: "internal" }, 500);
  }
});

async function runCleanup(admin: ReturnType<typeof createClient>) {
  const { data: settings } = await admin
    .from("app_settings")
    .select("selfie_retention_days")
    .eq("id", true)
    .maybeSingle();
  const retentionDays = settings?.selfie_retention_days ?? 30;

  let removedOrphans = 0;
  let removedExpired = 0;

  // ---- orphan uploads (registered but never attached within 24h) ----
  const cutoff24h = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: orphans } = await admin
    .from("photo_uploads")
    .select("path")
    .is("attached_at", null)
    .lt("created_at", cutoff24h)
    .limit(200);

  if (orphans && orphans.length > 0) {
    const paths = orphans.map((o: { path: string }) => o.path);
    await admin.storage.from("selfies").remove(paths);
    await admin.from("photo_uploads").delete().in("path", paths);
    removedOrphans = paths.length;
  }

  // ---- expired photos (older than retention) ----
  const cutoffRetention = new Date(
    Date.now() - retentionDays * 24 * 3600_000
  ).toISOString();

  for (let page = 0; page < 20; page++) {
    const { data: expired } = await admin
      .from("photo_uploads")
      .select("path")
      .not("attached_at", "is", null)
      .lt("attached_at", cutoffRetention)
      .limit(50);

    if (!expired || expired.length === 0) break;

    const paths = expired.map((o: { path: string }) => o.path);

    // remove physical files first — DB flags are only set on success
    const { error: rmError } = await admin.storage.from("selfies").remove(paths);
    if (rmError) throw rmError;

    await admin.rpc("mark_photos_deleted", { p_paths: paths });
    await admin.from("photo_uploads").delete().in("path", paths);
    removedExpired += paths.length;

    if (expired.length < 50) break;
  }

  return { removed_orphans: removedOrphans, removed_expired: removedExpired, retention_days: retentionDays };
}
