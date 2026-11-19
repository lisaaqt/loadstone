import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { publicNode } from "@/lib/nodes";
import { PageContainer } from "@/components/shell/page";
import { NodeDetail } from "@/components/nodes/node-detail";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function NodePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const node = await db.node.findUnique({ where: { id } });
  if (!node) notFound();
  const [metrics, servers] = await Promise.all([
    db.nodeMetric.findMany({ where: { nodeId: id, createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } }, orderBy: { createdAt: "asc" } }),
    db.server.findMany({ where: { nodeId: id }, orderBy: { name: "asc" }, select: { id: true, name: true, state: true, port: true, memoryMb: true, diskMb: true, software: true } }),
  ]);
  const toJson = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? Number(x) : x)));
  return (
    <PageContainer>
      <NodeDetail agentImage={env().AGENT_IMAGE} node={toJson(publicNode(node))} metrics={toJson(metrics)} servers={toJson(servers)} />
    </PageContainer>
  );
}
