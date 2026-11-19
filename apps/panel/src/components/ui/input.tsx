import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils";

const fieldBase =
  "w-full rounded-lg border border-border-strong bg-surface px-3 text-[13px] text-foreground shadow-[0_1px_2px_hsl(var(--shadow-color)/0.05)] placeholder:text-subtle transition-[border-color,box-shadow,background-color] duration-150 hover:border-[color-mix(in_oklab,var(--foreground)_22%,transparent)] focus-visible:border-primary/70 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-danger/15 dark:bg-white/[0.025] dark:hover:bg-white/[0.04] dark:focus-visible:bg-white/[0.04]";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(fieldBase, "h-9", className)} {...props} />,
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(fieldBase, "min-h-20 py-2", className)} {...props} />,
);
Textarea.displayName = "Textarea";

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn("text-[13px] font-medium text-foreground", className)} {...props} />
));
Label.displayName = "Label";

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

export function Field({ label, htmlFor, hint, error, className, children }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function InputGroup({ suffix, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { suffix: string }) {
  return (
    <div className={cn("relative flex items-center", className)}>
      <Input {...props} className="pr-12" />
      <span className="pointer-events-none absolute right-2.5 text-xs text-muted">{suffix}</span>
    </div>
  );
}
