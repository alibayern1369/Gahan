"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { resolveSuspiciousAction } from "@/lib/actions/attendance-admin";

export function ResolveSuspiciousButton({ id }: { id: number }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  return (
    <Button
      size="sm"
      variant="secondary"
      loading={pending}
      onClick={async () => {
        setPending(true);
        const r = await resolveSuspiciousAction(id);
        setPending(false);
        if (r.ok) {
          toast("success", "رسیدگی شد.");
          router.refresh();
        } else {
          toast("error", r.error);
        }
      }}
    >
      رسیدگی کردم
    </Button>
  );
}
