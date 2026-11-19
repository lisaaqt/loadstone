"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as AlertPrimitive from "@radix-ui/react-alert-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const overlayClass = "fixed inset-0 z-50 bg-[#0d0d14]/30 backdrop-blur-[3px] data-[state=open]:animate-fade-in dark:bg-black/60";
const panel =
  "fixed left-1/2 top-[10vh] z-50 max-h-[80vh] w-[calc(100vw-2rem)] -translate-x-1/2 overflow-y-auto rounded-2xl bg-surface shadow-pop data-[state=open]:animate-scale-in focus:outline-none dark:bg-[color-mix(in_oklab,var(--surface)_60%,var(--surface-2))]";

export function DialogContent({
  className,
  children,
  title,
  description,
  size = "md",
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const width = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-xl", xl: "max-w-3xl" }[size];
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClass} />
      <DialogPrimitive.Content className={cn(panel, width, className)} {...props}>
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <div>
            <DialogPrimitive.Title className="text-[15px] font-semibold tracking-[-0.015em] text-foreground">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-[13px] text-muted">{description}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{String(title)}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close className="rounded-md p-1 text-muted transition-colors hover:bg-surface-2 hover:text-foreground">
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-4 px-5 py-4", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center justify-end gap-2 rounded-b-2xl border-t border-border bg-surface-2/50 px-5 py-3 dark:bg-white/[0.015]", className)}
      {...props}
    />
  );
}

interface ConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  children?: React.ReactNode;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  destructive,
  loading,
  onConfirm,
  children,
}: ConfirmProps) {
  return (
    <AlertPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertPrimitive.Portal>
        <AlertPrimitive.Overlay className={overlayClass} />
        <AlertPrimitive.Content className={cn(panel, "max-w-md")}>
          <div className="px-5 pb-4 pt-5">
            <AlertPrimitive.Title className="text-[15px] font-semibold tracking-[-0.015em]">{title}</AlertPrimitive.Title>
            <AlertPrimitive.Description className="mt-1.5 text-[13px] leading-relaxed text-muted">
              {description}
            </AlertPrimitive.Description>
            {children && <div className="mt-4">{children}</div>}
          </div>
          <DialogFooter>
            <AlertPrimitive.Cancel asChild>
              <Button variant="ghost">Cancel</Button>
            </AlertPrimitive.Cancel>
            <Button
              variant={destructive ? "danger" : "primary"}
              loading={loading}
              onClick={(e) => {
                e.preventDefault();
                void onConfirm();
              }}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </AlertPrimitive.Content>
      </AlertPrimitive.Portal>
    </AlertPrimitive.Root>
  );
}
