import { Loader2 } from "lucide-react";

export default function AppLoading() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <Loader2 className="size-8 animate-spin text-brand-500" aria-hidden />
      <p className="text-xs text-secondary">در حال بارگذاری…</p>
    </div>
  );
}
