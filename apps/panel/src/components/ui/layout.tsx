import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4 pb-8", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-2.5 inline-flex items-center gap-1.5 text-xs font-medium text-primary dark:text-primary-strong">
            <span className="size-1.5 rounded-full bg-current" />
            {eyebrow}
          </div>
        )}
        <h1 className="text-gradient text-[26px] font-semibold leading-tight tracking-[-0.03em]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative flex flex-col items-center justify-center overflow-hidden px-6 py-16 text-center", className)}>
      <div className="pointer-events-none absolute inset-0 bg-dots opacity-50 [mask-image:radial-gradient(ellipse_at_center,black_10%,transparent_65%)]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 size-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative mb-4 flex size-12 items-center justify-center rounded-2xl border border-border-strong bg-surface shadow-pop dark:bg-surface-2">
        <Icon className="size-5 text-primary dark:text-primary-strong" />
      </div>
      <p className="relative text-sm font-semibold text-foreground">{title}</p>
      {description && <p className="relative mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">{description}</p>}
      {action && <div className="relative mt-5">{action}</div>}
    </div>
  );
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-[13px]", className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "h-9 border-b border-border bg-surface-2/60 px-5 text-left text-[11px] font-medium uppercase tracking-[0.06em] whitespace-nowrap text-subtle dark:bg-white/[0.02]",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("h-12 border-b border-border px-5 align-middle", className)} {...props} />;
}

export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors hover:bg-surface-2/60 dark:hover:bg-white/[0.02] [&:last-child>td]:border-b-0", className)} {...props} />;
}

export function Stat({
  label,
  value,
  sub,
  icon: Icon,
  tone = "primary",
  children,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: LucideIcon;
  tone?: "primary" | "success" | "info" | "warning";
  children?: React.ReactNode;
  className?: string;
}) {
  const toneClass = {
    primary: "text-primary dark:text-primary-strong",
    success: "text-success",
    info: "text-info",
    warning: "text-warning",
  }[tone];
  const glow = { primary: "bg-primary", success: "bg-success", info: "bg-info", warning: "bg-warning" }[tone];
  return (
    <div className={cn("surface group relative flex flex-col gap-4 overflow-hidden rounded-xl p-5", className)}>
      <div className={cn("pointer-events-none absolute -right-10 -top-12 size-32 rounded-full opacity-[0.07] blur-2xl dark:opacity-[0.12]", glow)} />
      <div className="relative flex items-center justify-between">
        <span className="text-[13px] font-medium text-muted">{label}</span>
        {Icon && (
          <span className={cn("icon-tile size-8 rounded-lg", toneClass)}>
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <div className="relative">
        <div className="text-[28px] font-semibold leading-none tracking-[-0.035em] tabular text-foreground">{value}</div>
        {sub && <div className="mt-2 text-xs text-muted">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

export function KeyValue({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 text-[13px]">
      <span className="text-muted">{label}</span>
      <span className={cn("truncate text-right text-foreground", mono && "font-mono text-xs")}>{children}</span>
    </div>
  );
}
