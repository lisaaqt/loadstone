"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { useTheme } from "next-themes";
import { ChevronRight, Moon, Plus, Search, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/misc";
import { openCommandPalette } from "./command-palette";

const LABELS: Record<string, string> = {
  servers: "Servers",
  nodes: "Nodes",
  backups: "Backups",
  plugins: "Plugins & Mods",
  activity: "Activity",
  settings: "Settings",
  new: "New",
  console: "Console",
  files: "Files",
  worlds: "Worlds",
  players: "Players",
  configuration: "Configuration",
  schedules: "Schedules",
  account: "Account",
  security: "Sessions & tokens",
  general: "General",
  users: "Users",
  storage: "Backup storage",
};

export function Topbar({ isAdmin, canCreate }: { isAdmin: boolean; canCreate: boolean }) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { data: servers } = useSWR<{ servers: { id: string; name: string }[] }>("/api/servers?view=sidebar");
  const { data: nodes } = useSWR<{ nodes: { id: string; name: string }[] }>(isAdmin && pathname.startsWith("/nodes/") ? "/api/nodes" : null);
  useEffect(() => setMounted(true), []);

  const segments = pathname.split("/").filter(Boolean);
  const crumbs = [{ href: "/", label: "Overview" }];
  segments.forEach((seg, i) => {
    const href = `/${segments.slice(0, i + 1).join("/")}`;
    let label = LABELS[seg] ?? seg;
    if (segments[i - 1] === "servers" && seg !== "new") label = servers?.servers.find((s) => s.id === seg)?.name ?? "Server";
    if (segments[i - 1] === "nodes") label = nodes?.nodes.find((n) => n.id === seg)?.name ?? "Node";
    crumbs.push({ href, label });
  });
  if (segments.length === 0) crumbs.splice(1);

  return (
    <header className="glass sticky top-0 z-20 hidden h-15 items-center gap-2.5 border-b border-border px-8 md:flex">
      <nav className="flex min-w-0 flex-1 items-center gap-1 text-[13px]">
        {crumbs.map((c, i) => (
          <span key={c.href} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-subtle/70" />}
            {i === crumbs.length - 1 ? (
              <span className="truncate rounded-md px-1.5 py-0.5 font-medium text-foreground">{c.label}</span>
            ) : (
              <Link href={c.href} className="truncate rounded-md px-1.5 py-0.5 text-muted transition-colors hover:bg-foreground/[0.04] hover:text-foreground">
                {c.label}
              </Link>
            )}
          </span>
        ))}
      </nav>
      <button
        onClick={openCommandPalette}
        className="flex h-8 w-60 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 text-[13px] text-subtle shadow-soft transition-colors hover:border-border-strong hover:text-muted lg:w-72 dark:bg-white/[0.03] dark:shadow-none"
      >
        <Search className="size-3.5" />
        Search or jump to…
        <kbd className="ml-auto rounded-md border border-border bg-surface-2 px-1.5 py-px font-mono text-[10px] text-muted dark:bg-white/[0.04]">⌘K</kbd>
      </button>
      <Tooltip content="Toggle theme" side="bottom">
        <Button variant="ghost" size="icon" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
          {mounted && resolvedTheme === "light" ? <Moon /> : <Sun />}
        </Button>
      </Tooltip>
      {canCreate && (
        <Button variant="primary" size="sm" asChild>
          <Link href="/servers/new">
            <Plus /> New server
          </Link>
        </Button>
      )}
    </header>
  );
}
