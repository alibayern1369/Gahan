"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/actions/auth";

export function SignOutButton({
  label,
  icon,
  variant = "secondary",
  full,
}: {
  label: string;
  icon?: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  full?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  return (
    <form
      action={async () => {
        setPending(true);
        await signOutAction();
        router.refresh();
      }}
    >
      <Button type="submit" variant={variant} size="md" loading={pending} className={full ? "w-full" : ""}>
        {icon}
        {label}
      </Button>
    </form>
  );
}
