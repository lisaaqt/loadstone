import { db } from "@/lib/db";
import { handler, parseBody } from "@/lib/api";
import { encrypt, randomToken } from "@/lib/crypto";
import { logActivity } from "@/lib/activity";
import { nodeInputSchema, probeNode, publicNode } from "@/lib/nodes";

export const GET = handler(
  async () => {
    const nodes = await db.node.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { servers: true } } } });
    return { nodes: nodes.map((n) => ({ ...publicNode(n), serverCount: n._count.servers })) };
  },
  { admin: true },
);

export const POST = handler(
  async ({ req, user, ip }) => {
    const input = await parseBody(req, nodeInputSchema);
    const token = randomToken(36);
    const node = await db.node.create({ data: { ...input, tokenEncrypted: encrypt(token) } });
    await logActivity({ action: "node.create", message: `Registered node ${node.name}`, userId: user.id, nodeId: node.id, ip });
    void probeNode(node);
    return Response.json({ node: { id: node.id }, token }, { status: 201 });
  },
  { admin: true },
);
