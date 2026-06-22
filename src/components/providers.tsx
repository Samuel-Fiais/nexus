"use client";

import { useEffect } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <>
      {children}
      <div id="toaster" aria-live="polite" className="sr-only" />
    </>
  );
}
