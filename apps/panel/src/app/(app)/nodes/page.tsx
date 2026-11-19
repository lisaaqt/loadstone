import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { publicNode } from "@/lib/nodes";
import { nodeUsage } from "@/lib/servers";
import { PageContainer } from "@/components/shell/page";
import { NodesView } from "@/components/nodes/nodes-view";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Nodes" };
export const dynamic = "force-dynamic";

export default async function NodesPage() {
  await requireAdmin();
  const nodes = await db.node.findMany({ orderBy: { name: "asc" } });
  const rows = await Promise.all(
    nodes.map(async (n) => {
      const usage = await nodeUsage(n.id);
      return { ...publicNode(n), allocatedMemoryMb: usage.memoryMb, allocatedDiskMb: usage.diskMb, serverCount: usage.servers };
    }),
  );
  return (
    <PageContainer>
      <NodesView agentImage={env().AGENT_IMAGE} initial={JSON.parse(JSON.stringify(rows, (_k, v) => (typeof v === "bigint" ? Number(v) : v)))} />
    </PageContainer>
  );
}
