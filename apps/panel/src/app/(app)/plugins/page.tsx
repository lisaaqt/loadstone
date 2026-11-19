import type { Metadata } from "next";
import { SOFTWARE } from "@loadstone/shared";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { serverScope } from "@/lib/access";
import { PageContainer } from "@/components/shell/page";
import { PageHeader } from "@/components/ui/layout";
import { GlobalAddons } from "@/components/plugins/global-addons";

export const metadata: Metadata = { title: "Plugins & Mods" };
export const dynamic = "force-dynamic";

export default async function PluginsOverviewPage() {
  const user = await requireUser();
  const servers = await db.server.findMany({
    where: serverScope(user),
    orderBy: { name: "asc" },
    select: { id: true, name: true, software: true, mcVersion: true, _count: { select: { plugins: true } } },
  });
  const eligible = servers.filter((s) => SOFTWARE[s.software].addonDirectory);
  return (
    <PageContainer>
      <PageHeader title="Plugins & Mods" description="Discover addons on Modrinth and Hangar and install them on any of your servers." />
      <GlobalAddons servers={eligible.map((s) => ({ id: s.id, name: s.name, software: s.software, mcVersion: s.mcVersion, installed: s._count.plugins }))} />
    </PageContainer>
  );
}
