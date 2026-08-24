"use client";

import { useActionState } from "react";
import { KeyRound, Mail, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, FieldLabel } from "@/components/ui/input";
import { signInAction, type LoginState } from "@/lib/actions/auth";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  return (
    <form action={formAction} className="glass-strong rounded-3xl p-6 space-y-4">
      <div>
        <FieldLabel htmlFor="email">ایمیل سازمانی</FieldLabel>
        <div className="relative">
          <Mail className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            dir="ltr"
            required
            placeholder="you@example.com"
            className="pr-11 text-left"
          />
        </div>
      </div>

      <div>
        <FieldLabel htmlFor="password">گذرواژه</FieldLabel>
        <div className="relative">
          <KeyRound className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={6}
            placeholder="••••••••"
            className="pr-11"
          />
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-xl bg-rose-500/10 px-3.5 py-2.5 text-xs font-medium text-rose-600 dark:text-rose-400">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" size="lg" loading={pending} className="w-full">
        {!pending && <LogIn className="size-4" aria-hidden />}
        ورود به گاهان
      </Button>
    </form>
  );
}
