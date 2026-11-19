import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { nodeUsage, serverQuota } from "@/lib/servers";
import { PageContainer } from "@/components/shell/page";
import { CreateServerWizard } from "@/components/servers/create-wizard";

export const metadata: Metadata = { title: "New server" };
export const dynamic = "force-dynamic";

export default async function NewServerPage() {
  const user = await requireUser();
  const quota = await serverQuota(user);
  if (!quota.canCreate) redirect("/servers");
  const isAdmin = user.role === "ADMIN";
  const [nodes, users] = await Promise.all([
    db.node.findMany({ where: isAdmin ? {} : { status: "ONLINE" }, orderBy: { name: "asc" } }),
    isAdmin ? db.user.findMany({ select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }) : [{ id: user.id, name: user.name, email: user.email }],
  ]);
  const nodeOptions = await Promise.all(
    nodes.map(async (n) => {
      const usage = await nodeUsage(n.id);
      return {
        id: n.id,
        name: n.name,
        status: n.status,
        publicHost: n.publicHost,
        freeMemoryMb: n.memoryMb - usage.memoryMb,
        freeDiskMb: n.diskMb - usage.diskMb,
        portRange: [n.portRangeStart, n.portRangeEnd] as [number, number],
      };
    }),
  );
  return (
    <PageContainer className="max-w-5xl">
      <CreateServerWizard nodes={nodeOptions} users={users} currentUserId={user.id} limits={quota.caps} />
    </PageContainer>
  );
}
