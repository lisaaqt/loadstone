import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { serverScope } from "@/lib/access";
import { getGeneralSettings } from "@/lib/settings";
import { serverQuota } from "@/lib/servers";
import { Sidebar } from "@/components/shell/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/shell/sidebar-state";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { CommandPalette } from "@/components/shell/command-palette";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [servers, settings, cookieStore, quota] = await Promise.all([
    db.server.findMany({
      where: serverScope(user),
      select: { id: true, name: true, state: true, software: true },
      orderBy: { name: "asc" },
      take: 30,
    }),
    getGeneralSettings(),
    cookies(),
    serverQuota(user),
  ]);
  return (
    <SidebarProvider initialCollapsed={cookieStore.get(SIDEBAR_COOKIE)?.value === "collapsed"}>
      <div className="min-h-screen">
        <Sidebar user={user} panelName={settings.panelName} servers={servers} canCreate={quota.canCreate} />
        <SidebarInset>
          <Topbar isAdmin={user.role === "ADMIN"} canCreate={quota.canCreate} />
          <main>{children}</main>
        </SidebarInset>
        <CommandPalette isAdmin={user.role === "ADMIN"} canCreate={quota.canCreate} />
      </div>
    </SidebarProvider>
  );
}
