"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-surface-3 p-0.5 shadow-[inset_0_1px_2px_hsl(var(--shadow-color)/0.12)] transition-colors focus-ring disabled:opacity-50 data-[state=checked]:bg-primary dark:bg-white/10",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-200 ease-out data-[state=checked]:translate-x-[14px]" />
    </SwitchPrimitive.Root>
  );
}

export function Checkbox({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "peer flex size-4 shrink-0 items-center justify-center rounded-[5px] border border-border-strong bg-surface shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06)] transition-colors focus-ring data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary dark:bg-white/[0.03]",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="text-white">
        {props.checked === "indeterminate" ? <Minus className="size-3" /> : <Check className="size-3" strokeWidth={3} />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <TooltipPrimitive.Root delayDuration={250}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-pop data-[state=delayed-open]:animate-scale-in dark:bg-surface-3 dark:text-foreground"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export function Progress({
  value,
  className,
  tone = "primary",
}: {
  value: number;
  className?: string;
  tone?: "primary" | "success" | "warning" | "danger";
}) {
  const color = {
    primary: "bg-[linear-gradient(90deg,color-mix(in_oklab,var(--primary)_60%,var(--info)),var(--primary))]",
    success: "bg-[linear-gradient(90deg,color-mix(in_oklab,var(--success)_75%,var(--background)),var(--success))]",
    warning: "bg-[linear-gradient(90deg,color-mix(in_oklab,var(--warning)_75%,var(--background)),var(--warning))]",
    danger: "bg-[linear-gradient(90deg,color-mix(in_oklab,var(--danger)_75%,var(--background)),var(--danger))]",
  }[tone];
  return (
    <ProgressPrimitive.Root value={value} className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-surface-3 dark:bg-white/[0.07]", className)}>
      <ProgressPrimitive.Indicator
        className={cn("h-full rounded-full transition-[width] duration-700 ease-out", color)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </ProgressPrimitive.Root>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer animate-shimmer rounded-lg bg-surface-2", className)} />;
}

export function Separator({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-border", className)} />;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-border-strong bg-surface px-1 font-mono text-[10px] text-muted shadow-[0_1px_0_var(--border-strong)] dark:bg-surface-3">
      {children}
    </kbd>
  );
}

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("inline-flex h-9 items-center gap-0.5 rounded-[11px] border border-border bg-surface-3/60 p-1 dark:bg-white/[0.03]", className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex h-full items-center gap-1.5 rounded-[7px] px-2.5 text-xs font-medium text-muted transition-colors hover:text-foreground focus-ring data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-soft dark:data-[state=active]:bg-surface-3 [&_svg]:size-3.5",
        className,
      )}
      {...props}
    />
  );
}

export const TabsContent = TabsPrimitive.Content;
