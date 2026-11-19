"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import useSWR from "swr";
import {
  Activity,
  Archive,
  Boxes,
  ChevronsUpDown,
  LayoutGrid,
  LogOut,
  Menu,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Puzzle,
  Search,
  Server,
  Settings,
  Sun,
  TriangleAlert,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ServerSoftware, ServerState } from "@/generated/prisma/client";
import { PANEL_VERSION } from "@loadstone/shared";
import { cn } from "@/lib/utils";
import { api } from "@/lib/client";
import { LogoMark } from "@/components/logo";
import { StatusDot } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/misc";
import { stateMeta } from "@/components/servers/state";
import { SoftwareIcon, SoftwareTile } from "@/components/servers/software-icon";
import { openCommandPalette } from "./command-palette";
import { useSidebar } from "./sidebar-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";

interface SidebarServer {
  id: string;
  name: string;
  state: ServerState;
  software: ServerSoftware;
}

interface SidebarProps {
  user: { name: string; email: string; role: "ADMIN" | "USER" };
  panelName: string;
  servers: SidebarServer[];
  canCreate: boolean;
}

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  admin?: boolean;
}

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Overview", icon: LayoutGrid, exact: true },
      { href: "/servers", label: "Servers", icon: Server },
      { href: "/backups", label: "Backups", icon: Archive },
      { href: "/plugins", label: "Plugins & Mods", icon: Puzzle },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/nodes", label: "Nodes", icon: Boxes, admin: true },
      { href: "/activity", label: "Activity", icon: Activity },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

/** Shows a tooltip on the right only while the sidebar is collapsed to its icon rail. */
function RailTip({ rail, label, children }: { rail: boolean; label: React.ReactNode; children: React.ReactElement }) {
  return rail ? (
    <Tooltip content={label} side="right">
      {children}
    </Tooltip>
  ) : (
    children
  );
}

export function Sidebar({ user, panelName, servers: initialServers, canCreate }: SidebarProps) {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebar();
  const [open, setOpen] = useState(false);
  const { data } = useSWR<{ servers: SidebarServer[] }>("/api/servers?view=sidebar", {
    fallbackData: { servers: initialServers },
    refreshInterval: 10_000,
  });
  const servers = data?.servers ?? initialServers;
  const running = servers.filter((s) => s.state === "RUNNING").length;
  // The icon rail only applies on desktop; the mobile drawer is always full width.
  const rail = collapsed && !open;

  useEffect(() => setOpen(false), [pathname]);

  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <>
      <div className="glass sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border px-4 md:hidden">
        <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold">
          <LogoMark className="size-6" />
          {panelName}
        </Link>
        <button onClick={() => setOpen((v) => !v)} className="rounded-lg p-2 text-muted hover:bg-surface-2" aria-label="Toggle navigation">
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </div>
      {open && <div className="fixed inset-0 z-30 bg-[#0d0d14]/30 backdrop-blur-[3px] md:hidden dark:bg-black/60" onClick={() => setOpen(false)} />}
      <aside
        data-collapsed={rail || undefined}
        className={cn(
          "group/sidebar fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-border bg-sidebar transition-[transform,width] duration-300 ease-out",
          "md:inset-y-3 md:left-3 md:translate-x-0 md:rounded-2xl md:border md:bg-sidebar/90 md:shadow-pop md:backdrop-blur-xl",
          rail ? "md:w-[68px]" : "md:w-60",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <button
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-[22px] z-10 hidden size-6 items-center justify-center rounded-full border border-border-strong bg-surface text-muted shadow-soft transition-colors hover:text-foreground focus-ring md:flex dark:bg-surface-3"
        >
          {collapsed ? <PanelLeftOpen className="size-3.5" /> : <PanelLeftClose className="size-3.5" />}
        </button>

        <div className={cn("flex h-[68px] shrink-0 items-center gap-3", rail ? "justify-center px-0" : "px-4")}>
          <Link href="/" aria-label={panelName} className="shrink-0">
            <LogoMark className="size-9" />
          </Link>
          {!rail && (
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-semibold tracking-[-0.015em]">{panelName}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
                <span className={cn("size-1.5 rounded-full", running > 0 ? "bg-success" : "bg-subtle")} />
                <span className="tabular">
                  {running}/{servers.length}
                </span>
                online
              </div>
            </div>
          )}
        </div>

        <div className={cn("pb-1", rail ? "px-3" : "px-3")}>
          <RailTip rail={rail} label="Search (⌘K)">
            <button
              onClick={openCommandPalette}
              aria-label="Search"
              className={cn(
                "group flex h-10 w-full items-center gap-2 rounded-xl border border-border bg-surface text-[13px] text-subtle shadow-soft transition-colors hover:border-border-strong hover:text-muted dark:bg-white/[0.03] dark:shadow-none",
                rail ? "justify-center px-0" : "px-3",
              )}
            >
              <Search className="size-4" />
              {!rail && (
                <>
                  Search…
                  <kbd className="ml-auto rounded-md border border-border bg-surface-2 px-1.5 py-px font-mono text-[10px] text-muted dark:bg-white/[0.04]">⌘K</kbd>
                </>
              )}
            </button>
          </RailTip>
        </div>

        <nav className="scrollbar-none flex flex-1 flex-col gap-5 overflow-y-auto overflow-x-hidden px-3 pt-4">
          {GROUPS.map((group) => {
            const items = group.items.filter((n) => !n.admin || user.role === "ADMIN");
            return (
              <div key={group.label}>
                {rail ? <div className="mx-auto mb-2 h-px w-6 bg-border" /> : <SectionLabel>{group.label}</SectionLabel>}
                <div className="flex flex-col gap-0.5">
                  {items.map((item) => {
                    const active = isActive(item.href, item.exact);
                    return (
                      <RailTip key={item.href} rail={rail} label={item.label}>
                        <Link
                          href={item.href}
                          aria-label={item.label}
                          className={cn(
                            "group relative flex h-10 items-center gap-3 rounded-xl text-[13.5px] transition-colors duration-150",
                            rail ? "justify-center px-0" : "px-3",
                            active
                              ? "bg-primary-soft font-medium text-foreground ring-1 ring-primary/15"
                              : "text-muted hover:bg-foreground/[0.04] hover:text-foreground",
                          )}
                        >
                          {active && <span className="absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />}
                          <item.icon className={cn("size-[18px] shrink-0 transition-colors", active ? "text-primary dark:text-primary-strong" : "text-subtle group-hover:text-muted")} />
                          {!rail && item.label}
                          {!rail && item.href === "/servers" && servers.length > 0 && (
                            <span className="ml-auto rounded-md bg-foreground/[0.06] px-1.5 text-[10px] font-semibold tabular text-muted">{servers.length}</span>
                          )}
                        </Link>
                      </RailTip>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="min-h-0">
            {rail ? (
              <div className="mx-auto mb-2 h-px w-6 bg-border" />
            ) : (
              <div className="flex items-center justify-between pr-1">
                <SectionLabel>Your servers</SectionLabel>
                {canCreate && (
                  <Link href="/servers/new" className="-mt-1.5 rounded-md p-1 text-subtle transition-colors hover:bg-foreground/[0.05] hover:text-foreground" aria-label="New server">
                    <Plus className="size-3.5" />
                  </Link>
                )}
              </div>
            )}
            <div className="flex flex-col gap-0.5 pb-3">
              {servers.length === 0 && !rail && <p className="px-3 py-1 text-xs text-subtle">No servers yet</p>}
              {servers.map((s) => {
                const meta = stateMeta(s.state);
                const active = pathname.startsWith(`/servers/${s.id}`);
                return (
                  <RailTip
                    key={s.id}
                    rail={rail}
                    label={
                      <span className="flex items-center gap-1.5">
                        {s.name} <span className="opacity-60">· {meta.label}</span>
                      </span>
                    }
                  >
                    <Link
                      href={`/servers/${s.id}`}
                      aria-label={s.name}
                      className={cn(
                        "group flex items-center gap-2.5 rounded-xl text-[13px] transition-colors",
                        rail ? "h-11 justify-center px-0" : "h-9 px-3",
                        active ? "bg-foreground/[0.05] font-medium text-foreground dark:bg-white/[0.06]" : "text-muted hover:bg-foreground/[0.04] hover:text-foreground",
                      )}
                    >
                      {rail ? (
                        <span className="relative">
                          <SoftwareTile software={s.software} size="sm" />
                          <StatusDot tone={meta.tone} pulse={meta.pulse} className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-sidebar" />
                        </span>
                      ) : (
                        <>
                          <SoftwareIcon software={s.software} className="size-4" />
                          <span className="truncate">{s.name}</span>
                          <StatusDot tone={meta.tone} pulse={meta.pulse} className="ml-auto size-1.5" />
                        </>
                      )}
                    </Link>
                  </RailTip>
                );
              })}
              {rail && canCreate && (
                <RailTip rail label="New server">
                  <Link
                    href="/servers/new"
                    aria-label="New server"
                    className="flex h-11 items-center justify-center rounded-xl border border-dashed border-border-strong text-subtle transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    <Plus className="size-4" />
                  </Link>
                </RailTip>
              )}
            </div>
          </div>
        </nav>

        <UserMenu user={user} rail={rail} />
      </aside>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-3 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-subtle">{children}</div>;
}

function UserMenu({ user, rail }: { user: SidebarProps["user"]; rail: boolean }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { data: update } = useSWR<{ latest: string | null; outdated: boolean }>(user.role === "ADMIN" ? "/api/meta/update" : null, {
    refreshInterval: 60 * 60 * 1000,
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="p-3">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Account menu"
          className={cn(
            "flex w-full items-center gap-2.5 rounded-xl text-left transition-colors focus-ring",
            rail
              ? "justify-center p-1 hover:bg-foreground/[0.05]"
              : "border border-border bg-surface p-2 shadow-soft hover:border-border-strong dark:bg-white/[0.03] dark:shadow-none dark:hover:bg-white/[0.05]",
          )}
        >
          <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--primary),color-mix(in_oklab,var(--primary)_45%,var(--info)))] text-[11px] font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.3)]">
            {initials || <User className="size-3.5" />}
            {update?.outdated && (
              <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-warning ring-2 ring-sidebar" aria-label="Update available" />
            )}
          </span>
          {!rail && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{user.name}</span>
                <span className="block truncate text-[11px] text-muted">{user.role === "ADMIN" ? "Administrator" : "Member"}</span>
              </span>
              <ChevronsUpDown className="size-3.5 text-subtle" />
            </>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align={rail ? "end" : "start"} side={rail ? "right" : "top"} className="w-56">
          <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
          <DropdownMenuLabel className="pt-0 text-[10.5px] font-normal text-subtle">Loadstone v{PANEL_VERSION}</DropdownMenuLabel>
          {update?.outdated && (
            <div className="mx-1 mb-1 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-2 py-1.5 text-[11.5px] leading-snug text-warning">
              <TriangleAlert className="mt-px size-3.5 shrink-0" />
              <span>
                Outdated: v{update.latest} is available. Pull the new images and restart the stack.
              </span>
            </div>
          )}
          <DropdownMenuItem onSelect={() => router.push("/settings/account")}>
            <User /> Account
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push("/settings/security")}>
            <Settings /> Sessions & tokens
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          {[
            { id: "dark", label: "Dark", icon: Moon },
            { id: "light", label: "Light", icon: Sun },
            { id: "system", label: "System", icon: Monitor },
          ].map((t) => (
            <DropdownMenuItem key={t.id} onSelect={() => setTheme(t.id)}>
              <t.icon /> {t.label}
              {theme === t.id && <span className="ml-auto size-1.5 rounded-full bg-primary" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={logout}>
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
