import Link from "next/link";
import {
  Archive,
  Boxes,
  FileText,
  Globe,
  KeyRound,
  LogIn,
  Power,
  Puzzle,
  Settings,
  ShieldAlert,
  Terminal,
  Timer,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import { formatDate, timeAgo } from "@/lib/format";
import { EmptyState } from "@/components/ui/layout";
import { Activity as ActivityIcon } from "lucide-react";

export interface ActivityItem {
  id: string;
  action: string;
  message: string;
  createdAt: Date | string;
  ip?: string | null;
  user: { id: string; name: string } | null;
  server: { id: string; name: string } | null;
}

const ICONS: [string, LucideIcon][] = [
  ["auth.failed", ShieldAlert],
  ["auth", LogIn],
  ["server.power", Power],
  ["server.command", Terminal],
  ["server", Settings],
  ["files", FileText],
  ["worlds", Globe],
  ["backup", Archive],
  ["plugins", Puzzle],
  ["players", Users],
  ["schedule", Timer],
  ["node", Boxes],
  ["token", KeyRound],
  ["user", User],
  ["account", User],
];

function iconFor(action: string): LucideIcon {
  return ICONS.find(([prefix]) => action.startsWith(prefix))?.[1] ?? ActivityIcon;
}

export function ActivityList({ items, showServer = true }: { items: ActivityItem[]; showServer?: boolean }) {
  if (items.length === 0) return <EmptyState icon={ActivityIcon} title="No activity yet" description="Actions taken in the panel will show up here." className="py-10" />;
  return (
    <ul className="divide-y divide-border">
      {items.map((a) => {
        const Icon = iconFor(a.action);
        const danger = a.action === "auth.failed" || a.action.endsWith(".failed");
        return (
          <li key={a.id} className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-surface-2/40">
            <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 ${danger ? "text-danger" : "text-muted"}`}>
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] leading-5 text-foreground">{a.message}</p>
              <p className="text-xs text-muted">
                {a.user?.name ?? "System"}
                {showServer && a.server && (
                  <>
                    {" · "}
                    <Link href={`/servers/${a.server.id}`} className="hover:text-foreground">
                      {a.server.name}
                    </Link>
                  </>
                )}
                {a.ip && a.ip !== "unknown" && <span className="font-mono"> · {a.ip}</span>}
              </p>
            </div>
            <time className="shrink-0 text-xs text-subtle" title={formatDate(a.createdAt)}>
              {timeAgo(a.createdAt)}
            </time>
          </li>
        );
      })}
    </ul>
  );
}
