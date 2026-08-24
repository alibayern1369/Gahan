import "server-only";
import { getServiceClient } from "@/lib/supabase/service";

export interface CleanupResult {
  ok: boolean;
  removed_orphans?: number;
  removed_expired?: number;
  retention_days?: number;
  error?: string;
}

/**
 * Photo retention job.
 *  1) Deletes orphan uploads (registered but never attached within 24h).
 *  2) Deletes selfie FILES older than the configured retention period
 *     (default 30 days) from the private bucket — while KEEPING the
 *     attendance database records for reporting, only flagging them.
 */
export async function runSelfieCleanup(): Promise<CleanupResult> {
  const admin = getServiceClient();

  try {
    const { data: settings } = await admin
      .from("app_settings")
      .select("selfie_retention_days")
      .eq("id", true)
      .maybeSingle<{ selfie_retention_days: number | null }>();

    const retentionDays = settings?.selfie_retention_days ?? 30;
    let removedOrphans = 0;
    let removedExpired = 0;

    // ---------- orphans ----------
    const cutoff24h = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: orphans } = await admin
      .from("photo_uploads")
      .select("path")
      .is("attached_at", null)
      .lt("created_at", cutoff24h)
      .limit(200);

    if (orphans && orphans.length > 0) {
      const paths = orphans.map((o) => o.path);
      const { error: rmError } = await admin.storage.from("selfies").remove(paths);
      if (rmError) throw rmError;
      await admin.from("photo_uploads").delete().in("path", paths);
      removedOrphans = paths.length;
    }

    // ---------- expired ----------
    const cutoffRetention = new Date(
      Date.now() - retentionDays * 24 * 3600_000
    ).toISOString();

    for (let page = 0; page < 40; page += 1) {
      const { data: expired } = await admin
        .from("photo_uploads")
        .select("path")
        .not("attached_at", "is", null)
        .lt("attached_at", cutoffRetention)
        .limit(50);

      if (!expired || expired.length === 0) break;

      const paths = expired.map((o) => o.path);
      const { error: rmError } = await admin.storage.from("selfies").remove(paths);
      if (rmError) throw rmError;

      await admin.rpc("mark_photos_deleted", { p_paths: paths });
      await admin.from("photo_uploads").delete().in("path", paths);
      removedExpired += paths.length;

      if (expired.length < 50) break;
    }

    return { ok: true, removed_orphans: removedOrphans, removed_expired: removedExpired, retention_days: retentionDays };
  } catch (err) {
    console.error("[cleanup] failed:", err);
    return { ok: false, error: "cleanup_failed" };
  }
}
