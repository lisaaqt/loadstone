"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import useSWR from "swr";
import { useTheme } from "next-themes";
import {
  Activity,
  Archive,
  ArrowRight,
  Boxes,
  CornerDownLeft,
  LayoutGrid,
  LogOut,
  Monitor,
  Moon,
  Plus,
  Puzzle,
  Search,
  Server,
  Settings,
  Sun,
  type LucideIcon,
} from "lucide-react";
import type { ServerSoftware, ServerState } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";
import { api } from "@/lib/client";
import { StatusDot } from "@/components/ui/badge";
import { overlayClass } from "@/components/ui/dialog";
import { stateMeta } from "@/components/servers/state";
import { SoftwareIcon } from "@/components/servers/software-icon";

export const OPEN_PALETTE_EVENT = "loadstone:open-palette";

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
}

interface Item {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon?: LucideIcon;
  render?: React.ReactNode;
  keywords?: string;
  run: () => void;
}

export function CommandPalette({ isAdmin, canCreate }: { isAdmin: boolean; canCreate: boolean }) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const { data } = useSWR<{ servers: { id: string; name: string; state: ServerState; software: ServerSoftware }[] }>(open ? "/api/servers?view=sidebar" : null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const go = (href: string) => () => {
      setOpen(false);
      router.push(href);
    };
    const nav: Item[] = [
      { id: "nav-overview", group: "Navigation", label: "Overview", icon: LayoutGrid, run: go("/") },
      { id: "nav-servers", group: "Navigation", label: "Servers", icon: Server, run: go("/servers") },
      ...(isAdmin ? [{ id: "nav-nodes", group: "Navigation", label: "Nodes", icon: Boxes, run: go("/nodes") }] : []),
      { id: "nav-backups", group: "Navigation", label: "Backups", icon: Archive, run: go("/backups") },
      { id: "nav-plugins", group: "Navigation", label: "Plugins & Mods", icon: Puzzle, run: go("/plugins") },
      { id: "nav-activity", group: "Navigation", label: "Activity", icon: Activity, run: go("/activity") },
      { id: "nav-settings", group: "Navigation", label: "Settings", icon: Settings, run: go("/settings/account") },
    ];
    const servers: Item[] = (data?.servers ?? []).flatMap((s) => [
      {
        id: `srv-${s.id}`,
        group: "Servers",
        label: s.name,
        hint: stateMeta(s.state).label,
        keywords: s.software,
        render: (
          <span className="flex items-center gap-2.5">
            <SoftwareIcon software={s.software} className="size-4" />
            {s.name}
            <StatusDot tone={stateMeta(s.state).tone} className="size-1.5" />
          </span>
        ),
        run: go(`/servers/${s.id}`),
      },
      { id: `srv-${s.id}-console`, group: "Servers", label: `${s.name} › Console`, keywords: "console terminal logs", icon: ArrowRight, run: go(`/servers/${s.id}/console`) },
      { id: `srv-${s.id}-files`, group: "Servers", label: `${s.name} › Files`, keywords: "files editor", icon: ArrowRight, run: go(`/servers/${s.id}/files`) },
    ]);
    const actions: Item[] = [
      ...(canCreate ? [{ id: "act-new", group: "Actions", label: "Create server", icon: Plus, keywords: "new add", run: go("/servers/new") }] : []),
      { id: "theme-dark", group: "Actions", label: "Switch to dark theme", icon: Moon, run: () => (setTheme("dark"), setOpen(false)) },
      { id: "theme-light", group: "Actions", label: "Switch to light theme", icon: Sun, run: () => (setTheme("light"), setOpen(false)) },
      { id: "theme-system", group: "Actions", label: "Use system theme", icon: Monitor, run: () => (setTheme("system"), setOpen(false)) },
      {
        id: "logout",
        group: "Actions",
        label: "Sign out",
        icon: LogOut,
        run: () => {
          void api("/api/auth/logout", { method: "POST" }).finally(() => {
            router.replace("/login");
            router.refresh();
          });
        },
      },
    ];
    const all = [...nav, ...servers, ...actions];
    const q = query.trim().toLowerCase();
    if (!q) return all.filter((i) => !i.id.endsWith("-console") && !i.id.endsWith("-files"));
    return all.filter((i) => `${i.label} ${i.keywords ?? ""} ${i.group}`.toLowerCase().includes(q));
  }, [data, query, isAdmin, router, setTheme]);

  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[index]?.run();
    }
  }

  let lastGroup = "";
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlayClass} />
        <DialogPrimitive.Content
          onKeyDown={onKeyDown}
          className="fixed left-1/2 top-[14vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl bg-surface shadow-pop data-[state=open]:animate-scale-in focus:outline-none dark:bg-[color-mix(in_oklab,var(--surface)_60%,var(--surface-2))]"
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Search pages, servers and actions</DialogPrimitive.Description>
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="size-4 text-subtle" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search servers, pages and actions…"
              className="h-13 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
            />
            <kbd className="rounded-md border border-border-strong bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">ESC</kbd>
          </div>
          <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
            {items.length === 0 && <p className="px-3 py-10 text-center text-[13px] text-muted">No results for “{query}”</p>}
            {items.map((item, i) => {
              const header = item.group !== lastGroup ? item.group : null;
              lastGroup = item.group;
              const Icon = item.icon;
              return (
                <div key={item.id}>
                  {header && <div className="px-3 pb-1.5 pt-3 text-[11px] font-medium uppercase tracking-wider text-subtle first:pt-1">{header}</div>}
                  <button
                    data-index={i}
                    onMouseMove={() => setIndex(i)}
                    onClick={item.run}
                    className={cn(
                      "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[13px] transition-colors",
                      i === index ? "bg-primary-soft text-foreground" : "text-muted",
                    )}
                  >
                    {item.render ?? (
                      <span className="flex items-center gap-2.5">
                        {Icon && <Icon className="size-4 text-subtle" />}
                        {item.label}
                      </span>
                    )}
                    {item.hint && <span className="ml-auto text-xs text-subtle">{item.hint}</span>}
                    {i === index && <CornerDownLeft className={cn("size-3.5 text-subtle", !item.hint && "ml-auto")} />}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 border-t border-border bg-surface-2/50 px-4 py-2 text-[11px] text-subtle dark:bg-white/[0.015]">
            <span>↑↓ navigate</span>
            <span>↵ open</span>
            <span className="ml-auto">⌘K / Ctrl K</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
