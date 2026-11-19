import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageServer, serverScope } from "@/lib/access";
import { ServerShell } from "@/components/servers/server-shell";
import type { ServerInfo } from "@/components/servers/use-server";

export const dynamic = "force-dynamic";

export default async function ServerLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const server = await db.server.findFirst({
    where: { id, ...serverScope(user) },
    include: { node: { select: { id: true, name: true, publicHost: true } }, owner: { select: { name: true } } },
  });
  if (!server) notFound();
  const info: ServerInfo = {
    id: server.id,
    name: server.name,
    description: server.description,
    software: server.software,
    mcVersion: server.mcVersion,
    javaVersion: server.javaVersion,
    image: server.image,
    memoryMb: server.memoryMb,
    cpuPercent: server.cpuPercent,
    diskMb: server.diskMb,
    port: server.port,
    internalPort: server.internalPort,
    state: server.state,
    installError: server.installError,
    address: `${server.node.publicHost}:${server.port}`,
    nodeName: server.node.name,
    nodeId: server.node.id,
    ownerName: server.owner.name,
    createdAt: server.createdAt.toISOString(),
    canAdmin: user.role === "ADMIN",
    canManage: canManageServer(user, server),
  };
  return <ServerShell server={info}>{children}</ServerShell>;
}
