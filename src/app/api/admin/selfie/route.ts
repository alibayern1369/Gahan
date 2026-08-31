import { NextResponse } from "next/server";
import { getAdminOrNull } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET(req: Request) {
  const admin = await getAdminOrNull();
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const rawPath = url.searchParams.get("path");
  if (!rawPath || rawPath.includes("..")) {
    return NextResponse.json({ error: "invalid path" }, { status: 400 });
  }
  const path = decodeURIComponent(rawPath).replace(/^\/+/, "");

  const supabase = await createClient();
  let blob = (await supabase.storage.from("selfies").download(path)).data;

  if (!blob) {
    try {
      blob = (await getServiceClient().storage.from("selfies").download(path)).data;
    } catch {
      blob = null;
    }
  }

  if (!blob) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const buf = await blob.arrayBuffer();
  return new NextResponse(buf, {
    headers: {
      "Content-Type": blob.type || "image/jpeg",
      "Cache-Control": "private, max-age=300",
    },
  });
}
