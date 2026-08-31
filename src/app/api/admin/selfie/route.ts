import { NextResponse } from "next/server";
import { getAdminOrNull } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET(req: Request) {
  const admin = await getAdminOrNull();
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  if (!path || path.includes("..")) {
    return NextResponse.json({ error: "invalid path" }, { status: 400 });
  }

  const service = getServiceClient();
  const { data, error } = await service.storage.from("selfies").download(path);
  if (error || !data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const buf = await data.arrayBuffer();
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=300",
    },
  });
}
