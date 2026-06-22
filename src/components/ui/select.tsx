"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type SelectContextValue = {
  value: string;
  onValueChange: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  placeholder?: string;
  labels: Map<string, string>;
  registerLabel: (value: string, label: string) => void;
};

const SelectContext = React.createContext<SelectContextValue | null>(null);

function useSelect() {
  const context = React.useContext(SelectContext);

  if (!context) {
    throw new Error("Select components must be used inside Select.");
  }

  return context;
}

export function Select({
  value,
  onValueChange,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const labels = React.useRef(new Map<string, string>());
  const [, forceRender] = React.useState(0);

  const registerLabel = React.useCallback((itemValue: string, label: string) => {
    if (labels.current.get(itemValue) === label) {
      return;
    }

    labels.current.set(itemValue, label);
    forceRender((count) => count + 1);
  }, []);

  return (
    <SelectContext.Provider
      value={{
        value,
        onValueChange,
        open,
        setOpen,
        labels: labels.current,
        registerLabel,
      }}
    >
      <div className="relative">{children}</div>
    </SelectContext.Provider>
  );
}

export function SelectTrigger({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const { open, setOpen } = useSelect();

  return (
    <button
      type="button"
      aria-haspopup="listbox"
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      className={cn(
        "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-left text-sm shadow-sm outline-none transition-colors hover:bg-accent focus:border-ring focus:ring-2 focus:ring-ring/15",
        className,
      )}
    >
      {children}
      <span aria-hidden="true" className="text-muted-foreground">
        v
      </span>
    </button>
  );
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  const { value, labels } = useSelect();

  return <span className={cn("truncate", !value && "text-muted-foreground")}>{labels.get(value) ?? placeholder}</span>;
}

export function SelectContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const { open, setOpen } = useSelect();
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [setOpen]);

  if (!open) {
    return null;
  }

  return (
    <div
      ref={ref}
      role="listbox"
      className={cn(
        "absolute z-50 mt-2 max-h-72 w-full overflow-auto rounded-md border border-border bg-popover bg-white p-1 text-sm shadow-lg",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SelectItem({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  const { value: selectedValue, onValueChange, setOpen, registerLabel } = useSelect();
  const label = React.Children.toArray(children).join("");

  React.useEffect(() => {
    registerLabel(value, label);
  }, [label, registerLabel, value]);

  return (
    <button
      type="button"
      role="option"
      aria-selected={selectedValue === value}
      onClick={() => {
        onValueChange(value);
        setOpen(false);
      }}
      className={cn(
        "flex w-full items-center rounded-sm px-2 py-2 text-left text-sm outline-none transition-colors hover:bg-accent",
        selectedValue === value && "bg-accent font-medium text-accent-foreground",
      )}
    >
      {children}
    </button>
  );
}
