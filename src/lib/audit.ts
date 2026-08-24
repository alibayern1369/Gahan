import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface AuditInput {
  action: string;
  entity: string;
  entityId?: string | number | null;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  meta?: Record<string, unknown> | null;
}

/**
 * Append-only audit trail. Failures are swallowed intentionally — auditing must
 * never break the primary business operation.
 */
export async function writeAudit(actorId: string | null, input: AuditInput): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from("audit_logs").insert({
      actor_id: actorId,
      action: input.action,
      entity: input.entity,
      entity_id: input.entityId != null ? String(input.entityId) : null,
      old_value: input.oldValue ?? null,
      new_value: input.newValue ?? null,
      meta: input.meta ?? null,
    });
  } catch (err) {
    console.error("[audit] failed to write audit log", err);
  }
}
