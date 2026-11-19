import { db } from "@/lib/db";
import { ApiError, handler, notFound, parseBody } from "@/lib/api";
import { encrypt, randomToken } from "@/lib/crypto";
import { logActivity } from "@/lib/activity";
import { nodeInputSchema, probeNode, publicNode } from "@/lib/nodes";

type Params = { id: string };

async function load(id: string) {
  const node = await db.node.findUnique({ where: { id } });
  if (!node) throw notFound("Node");
  return node;
}

export const GET = handler<Params>(
  async ({ req, params }) => {
    const node = await load(params.id);
    const hours = Math.min(Number(req.nextUrl.searchParams.get("hours") ?? 24) || 24, 168);
    const metrics = await db.nodeMetric.findMany({
      where: { nodeId: node.id, createdAt: { gte: new Date(Date.now() - hours * 3600_000) } },
      orderBy: { createdAt: "asc" },
    });
    return { node: publicNode(node), metrics };
  },
  { admin: true },
);

export const PATCH = handler<Params>(
  async ({ req, user, params, ip }) => {
    const node = await load(params.id);
    const input = await parseBody(req, nodeInputSchema);
    const conflicts = await db.server.count({
      where: {
        nodeId: node.id,
        OR: [{ port: { lt: input.portRangeStart } }, { port: { gt: input.portRangeEnd } }],
        port: { notIn: input.extraPorts },
      },
    });
    if (conflicts > 0) throw new ApiError(409, `${conflicts} server(s) use ports outside the new range`);
    const updated = await db.node.update({ where: { id: node.id }, data: input });
    await logActivity({ action: "node.update", message: `Updated node ${updated.name}`, userId: user.id, nodeId: node.id, ip });
    return { node: publicNode(updated) };
  },
  { admin: true },
);

export const POST = handler<Params>(
  async ({ req, user, params, ip }) => {
    const node = await load(params.id);
    const action = req.nextUrl.searchParams.get("action");
    if (action === "rotate-token") {
      const token = randomToken(36);
      await db.node.update({ where: { id: node.id }, data: { tokenEncrypted: encrypt(token), status: "UNKNOWN" } });
      await logActivity({ action: "node.rotate-token", message: `Rotated the agent token of ${node.name}`, userId: user.id, nodeId: node.id, ip });
      return { token };
    }
    if (action === "test") {
      const result = await probeNode(node);
      return result.ok ? { ok: true, info: result.info } : { ok: false, error: result.error };
    }
    throw new ApiError(400, "Unknown action");
  },
  { admin: true },
);

export const DELETE = handler<Params>(
  async ({ user, params, ip }) => {
    const node = await load(params.id);
    const servers = await db.server.count({ where: { nodeId: node.id } });
    if (servers > 0) throw new ApiError(409, "Delete or move all servers on this node first");
    await db.node.delete({ where: { id: node.id } });
    await logActivity({ action: "node.delete", message: `Removed node ${node.name}`, userId: user.id, ip });
  },
  { admin: true },
);
