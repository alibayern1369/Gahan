"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

type ToastTone = "success" | "error" | "info";

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  toast: (tone: ToastTone, message: string) => void;
}

const ToastContext = createContext<ToastApi>({ toast: () => undefined });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

const icons: Record<ToastTone, ReactNode> = {
  success: <CheckCircle2 className="size-5 text-mint-500" aria-hidden />,
  error: <TriangleAlert className="size-5 text-rose-500" aria-hidden />,
  info: <Info className="size-5 text-sky-500" aria-hidden />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (tone: ToastTone, message: string) => {
      counter.current += 1;
      const id = counter.current;
      setToasts((prev) => [...prev.slice(-3), { id, tone, message }]);
      window.setTimeout(() => dismiss(id), 5200);
    },
    [dismiss]
  );

  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top,0px)+12px)] z-100 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="glass-strong pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-2xl p-3.5 pop-in"
          >
            {icons[t.tone]}
            <p className="flex-1 pt-0.5 text-xs font-medium leading-5">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="بستن پیام"
              className="-m-1 rounded-full p-1 text-faint hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring-color)]"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
