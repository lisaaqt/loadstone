import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { serverScope } from "@/lib/access";
import { serverQuota } from "@/lib/servers";
import { PageContainer } from "@/components/shell/page";
import { PageHeader } from "@/components/ui/layout";
import { ServersTable } from "@/components/servers/servers-table";

export const metadata: Metadata = { title: "Servers" };
export const dynamic = "force-dynamic";

export default async function ServersPage() {
  const user = await requireUser();
  const servers = await db.server.findMany({
    where: serverScope(user),
    orderBy: { createdAt: "desc" },
    include: { node: { select: { id: true, name: true, publicHost: true, status: true } }, owner: { select: { id: true, name: true } } },
  });
  return (
    <PageContainer>
      <PageHeader title="Servers" description="Every Minecraft server you have access to, with live status." />
      <ServersTable initial={JSON.parse(JSON.stringify(servers))} canCreate={(await serverQuota(user)).canCreate} />
    </PageContainer>
  );
}
