"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";
type ToastItem = {
  id: string;
  message: string;
  kind: ToastKind;
};

const listeners = new Set<(toast: ToastItem) => void>();

function emit(message: string, kind: ToastKind) {
  const item = { id: crypto.randomUUID(), message, kind };
  listeners.forEach((listener) => listener(item));
}

export const toast = {
  success: (message: string) => emit(message, "success"),
  error: (message: string) => emit(message, "error"),
  message: (message: string) => emit(message, "info"),
};

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    function addToast(item: ToastItem) {
      setItems((current) => [...current, item]);
      window.setTimeout(() => {
        setItems((current) => current.filter((toastItem) => toastItem.id !== item.id));
      }, 3200);
    }

    listeners.add(addToast);
    return () => {
      listeners.delete(addToast);
    };
  }, []);

  return (
    <div className="fixed right-4 top-4 z-[100] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          role="status"
          className={cn(
            "rounded-lg border bg-white px-4 py-3 text-sm text-foreground shadow-lg",
            item.kind === "success" && "border-emerald-200",
            item.kind === "error" && "border-red-200",
            item.kind === "info" && "border-border",
          )}
        >
          {item.message}
        </div>
      ))}
    </div>
  );
}
