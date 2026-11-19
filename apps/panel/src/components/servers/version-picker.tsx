"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

export function VersionPicker({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { data, isLoading } = useSWR<{ latest: string | null; releases: string[] }>("/api/meta/versions", { revalidateOnFocus: false });
  const options = useMemo(() => {
    const all = ["LATEST", ...(data?.releases ?? [])];
    const q = query.trim();
    const list = q ? all.filter((v) => v.toLowerCase().includes(q.toLowerCase())) : all;
    if (q && /^\d+(\.\d+){1,2}$/.test(q) && !list.includes(q)) list.unshift(q);
    return list.slice(0, 200);
  }, [data, query]);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        id={id}
        className="inline-flex h-9 w-full items-center justify-between rounded-lg border border-border-strong bg-surface px-3 text-[13px] shadow-[0_1px_2px_hsl(var(--shadow-color)/0.05)] transition-[border-color,box-shadow,background-color] hover:border-[color-mix(in_oklab,var(--foreground)_22%,transparent)] focus-visible:border-primary/70 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15 data-[state=open]:border-primary/70 data-[state=open]:ring-[3px] data-[state=open]:ring-primary/15 dark:bg-white/[0.025] dark:hover:bg-white/[0.04]"
      >
        <span>
          {value === "LATEST" ? (
            <>
              Latest release{data?.latest && <span className="ml-1.5 text-muted">({data.latest})</span>}
            </>
          ) : (
            value
          )}
        </span>
        <ChevronsUpDown className="size-3.5 text-muted" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-lg border border-border-strong bg-surface shadow-pop data-[state=open]:animate-scale-in"
        >
          <div className="flex items-center gap-2 border-b border-border px-2.5">
            <Search className="size-3.5 text-subtle" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search versions…"
              className="h-9 flex-1 bg-transparent text-[13px] outline-none placeholder:text-subtle"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {isLoading && <p className="px-2 py-2 text-xs text-muted">Loading versions…</p>}
            {options.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  onChange(v);
                  setOpen(false);
                  setQuery("");
                }}
                className={cn("flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-2", v === value && "text-primary")}
              >
                {v === "LATEST" ? "Latest release" : v}
                {v === value && <Check className="size-3.5" />}
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
