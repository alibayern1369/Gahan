"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type SubmitResult =
  | { ok: true; type: string; sessionId: number; at: string; lateMinutes?: number; workedMinutes?: number; distanceM?: number; radiusM?: number; workplace?: string }
  | { ok: false; code: string; distanceM?: number; radiusM?: number; accuracy?: number; maxAccuracy?: number };

export type PrecheckResult =
  | { ok: true; distanceM: number; radiusM: number; workplace: string; latitude?: number; longitude?: number }
  | { ok: false; code: string; distanceM?: number; radiusM?: number; accuracy?: number; maxAccuracy?: number };

const coordsSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100_000),
});

/**
 * Pre-camera location validation. Runs entirely against the database RPC so
 * the client never decides whether a location is acceptable.
 */
export async function precheckLocationAction(coords: unknown): Promise<PrecheckResult> {
  const parsed = coordsSchema.safeParse(coords);
  if (!parsed.success) {
    return { ok: false, code: "out_of_range" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("validate_attendance_location", {
    p_latitude: parsed.data.latitude,
    p_longitude: parsed.data.longitude,
    p_accuracy: parsed.data.accuracy,
  });

  if (error || !data) {
    console.error("[precheck]", error?.message);
    return { ok: false, code: "server_error" };
  }
  return data as PrecheckResult;
}

/**
 * Final authoritative submission. The database function:
 *  - resolves identity from the session cookie
 *  - recomputes distance server-side
 *  - takes the timestamp from clock_timestamp()
 *  - enforces state machine with row locks
 */
export async function submitAttendanceAction(input: unknown): Promise<SubmitResult> {
  const schema = z.object({
    type: z.enum(["check_in", "check_out"]),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().min(0).max(100_000),
    photoPath: z.string().min(3).max(200),
  });

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "invalid_photo" };
  }

  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = headerList.get("user-agent");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_attendance", {
    p_type: parsed.data.type,
    p_latitude: parsed.data.latitude,
    p_longitude: parsed.data.longitude,
    p_accuracy: parsed.data.accuracy,
    p_photo_path: parsed.data.photoPath,
    p_user_agent: ua,
    p_ip: ip,
  });

  if (error || !data) {
    // unique_violation races surface as Postgres errors → duplicate
    console.error("[submit-attendance]", error?.message);
    return { ok: false, code: error?.code === "23505" ? "already_checked_in" : "server_error" };
  }
  return data as SubmitResult;
}
