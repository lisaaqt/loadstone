"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/settings/account", label: "Account" },
  { href: "/settings/security", label: "Sessions & API tokens" },
  { href: "/settings/general", label: "General", admin: true },
  { href: "/settings/users", label: "Users", admin: true },
  { href: "/settings/storage", label: "Backup storage", admin: true },
  { href: "/settings/email", label: "Email", admin: true },
  { href: "/settings/databases", label: "Database hosts", admin: true },
];

export function SettingsNav({ admin }: { admin: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-row gap-0.5 overflow-x-auto md:flex-col">
      {ITEMS.filter((i) => !i.admin || admin).map((item, idx, arr) => (
        <div key={item.href}>
          {item.admin && !arr[idx - 1]?.admin && (
            <div className="mb-2 mt-5 hidden px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-subtle md:block">Administration</div>
          )}
          <Link
            href={item.href}
            className={cn(
              "flex h-8 items-center whitespace-nowrap rounded-lg px-2.5 text-[13px] transition-colors",
              pathname === item.href
                ? "bg-surface font-medium text-foreground shadow-soft ring-1 ring-border dark:bg-white/[0.06] dark:shadow-none dark:ring-white/[0.04]"
                : "text-muted hover:bg-foreground/[0.04] hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        </div>
      ))}
    </nav>
  );
}
