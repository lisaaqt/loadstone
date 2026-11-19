import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "relative inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-[13px] font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 focus-ring disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-primary bg-[linear-gradient(180deg,rgb(255_255_255/0.16),rgb(255_255_255/0)_60%)] text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_0_0_1px_var(--primary-hover),0_1px_2px_hsl(var(--shadow-color)/0.25),0_4px_12px_-4px_color-mix(in_oklab,var(--primary)_55%,transparent)] hover:bg-primary-hover hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_0_0_1px_var(--primary-hover),0_1px_2px_hsl(var(--shadow-color)/0.25),0_8px_20px_-6px_color-mix(in_oklab,var(--primary)_70%,transparent)]",
        secondary:
          "border border-border-strong bg-surface text-foreground shadow-soft hover:bg-surface-2 dark:bg-surface-2 dark:hover:bg-surface-3",
        outline: "border border-border-strong bg-transparent text-foreground hover:bg-surface-2",
        ghost: "text-muted hover:bg-surface-2 hover:text-foreground dark:hover:bg-surface-3/70",
        danger:
          "bg-danger bg-[linear-gradient(180deg,rgb(255_255_255/0.14),rgb(255_255_255/0)_60%)] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_0_0_1px_color-mix(in_oklab,var(--danger)_85%,black),0_1px_2px_hsl(var(--shadow-color)/0.25)] hover:bg-[color-mix(in_oklab,var(--danger)_90%,black)]",
        "danger-outline": "border border-danger/30 bg-danger/[0.04] text-danger hover:border-danger/50 hover:bg-danger/10",
        link: "h-auto px-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-7 rounded-md px-2.5 text-xs",
        md: "h-8 px-3",
        lg: "h-10 rounded-[11px] px-4 text-sm",
        icon: "size-8",
        "icon-sm": "size-7 rounded-md",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Loader2 className="animate-spin" />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";
