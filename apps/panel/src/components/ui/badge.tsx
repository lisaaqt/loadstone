import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4",
  {
    variants: {
      tone: {
        neutral: "border-border-strong bg-surface-2 text-muted dark:bg-surface-3/60",
        primary: "border-primary/25 bg-primary-soft text-primary dark:text-primary-strong",
        success: "border-success/25 bg-success/[0.09] text-success",
        warning: "border-warning/25 bg-warning/[0.09] text-warning",
        danger: "border-danger/25 bg-danger/[0.08] text-danger",
        info: "border-info/25 bg-info/[0.08] text-info",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export type Tone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

const dotTone: Record<Tone, string> = {
  neutral: "bg-subtle",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

export function StatusDot({ tone = "neutral", pulse, className }: { tone?: Tone; pulse?: boolean; className?: string }) {
  return (
    <span className={cn("relative inline-flex size-2 shrink-0", className)}>
      {pulse && <span className={cn("absolute inset-0 animate-ping rounded-full opacity-40", dotTone[tone])} />}
      <span
        className={cn("relative inline-flex size-full rounded-full", dotTone[tone])}
        style={tone !== "neutral" ? { boxShadow: `0 0 0 3px color-mix(in oklab, var(--${tone}) 18%, transparent)` } : undefined}
      />
    </span>
  );
}
