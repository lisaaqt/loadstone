import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("surface rounded-xl", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  actions,
  icon,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-14 items-center justify-between gap-4 border-b border-border px-5 py-3", className)}>
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <span className="icon-tile size-8 rounded-lg text-primary dark:text-primary-strong [&_svg]:size-4">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-[13.5px] font-semibold tracking-[-0.012em] text-foreground">{title}</h3>
          {description && <p className="mt-0.5 truncate text-xs text-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center justify-end gap-2 rounded-b-xl border-t border-border bg-surface-2/50 px-5 py-3 dark:bg-white/[0.015]", className)}
      {...props}
    />
  );
}
