"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

import { cn } from "@/lib/utils";

function Sheet({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root {...props} />;
}

function SheetTrigger({
  className,
  children,
  ...props
}: DialogPrimitive.Trigger.Props & { children: React.ReactNode }) {
  return (
    <DialogPrimitive.Trigger
      data-slot="sheet-trigger"
      className={cn("inline-flex", className)}
      {...props}
    >
      {children}
    </DialogPrimitive.Trigger>
  );
}

function SheetClose({
  className,
  children,
  ...props
}: DialogPrimitive.Close.Props & { children?: React.ReactNode }) {
  return (
    <DialogPrimitive.Close
      data-slot="sheet-close"
      className={cn("inline-flex", className)}
      {...props}
    >
      {children}
    </DialogPrimitive.Close>
  );
}

function SheetPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 transition-opacity data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
        className
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = "left",
  ...props
}: DialogPrimitive.Popup.Props & { side?: "left" | "right" }) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Popup
        data-slot="sheet-content"
        className={cn(
          "fixed z-50 flex h-full flex-col gap-4 bg-background p-6 shadow-xl transition-transform data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full",
          side === "left"
            ? "inset-y-0 left-0 w-3/4 max-w-sm data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full"
            : "inset-y-0 right-0 w-3/4 max-w-sm data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full",
          className
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-lg font-semibold text-foreground", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
