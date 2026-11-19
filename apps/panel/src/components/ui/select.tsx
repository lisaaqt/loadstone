"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: React.ReactNode;
  description?: string;
  disabled?: boolean;
}

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  size?: "sm" | "md";
}

export function Select({ value, onValueChange, options, placeholder, className, disabled, id, size = "md" }: SelectProps) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        id={id}
        className={cn(
          "inline-flex w-full items-center justify-between gap-2 rounded-lg border border-border-strong bg-surface px-3 text-left text-[13px] text-foreground shadow-[0_1px_2px_hsl(var(--shadow-color)/0.05)] transition-[border-color,box-shadow,background-color] hover:border-[color-mix(in_oklab,var(--foreground)_22%,transparent)] focus-visible:border-primary/70 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15 disabled:opacity-50 data-[placeholder]:text-subtle data-[state=open]:border-primary/70 data-[state=open]:ring-[3px] data-[state=open]:ring-primary/15 dark:bg-white/[0.025] dark:hover:bg-white/[0.04]",
          size === "sm" ? "h-7 rounded-md px-2.5 text-xs" : "h-9",
          className,
        )}
      >
        <span className="truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon>
          <ChevronsUpDown className="size-3.5 text-muted" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-80 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl bg-surface shadow-pop data-[state=open]:animate-scale-in dark:bg-surface-2"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                className="relative flex cursor-default select-none items-center rounded-md py-1.5 pl-2 pr-8 text-[13px] outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2 data-[state=checked]:font-medium dark:data-[highlighted]:bg-surface-3"
              >
                <div className="flex flex-col">
                  <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                  {o.description && <span className="text-xs text-muted">{o.description}</span>}
                </div>
                <SelectPrimitive.ItemIndicator className="absolute right-2">
                  <Check className="size-3.5 text-primary" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
