import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handler, parseBody } from "@/lib/api";
import { canManageServer, getServerForUser } from "@/lib/access";
import { logActivity } from "@/lib/activity";
import { emailSchema } from "@/lib/validation";
import { env } from "@/lib/env";
import { sendTemplate } from "@/lib/mail";

type Params = { id: string };

async function manageable(user: Parameters<typeof getServerForUser>[0], id: string) {
  const server = await getServerForUser(user, id);
  if (!canManageServer(user, server)) throw new ApiError(403, "Only the owner or an administrator can manage members");
  return server;
}

export const GET = handler<Params>(async ({ user, params }) => {
  const server = await manageable(user, params.id);
  const [owner, members, invites] = await Promise.all([
    db.user.findUnique({ where: { id: server.ownerId }, select: { id: true, name: true, email: true } }),
    db.serverMember.findMany({
      where: { serverId: server.id },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    db.serverInvite.findMany({
      where: { serverId: server.id, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, expiresAt: true },
    }),
  ]);
  return { owner, members: members.map((m) => ({ id: m.id, createdAt: m.createdAt, user: m.user })), invites };
});

/** Adds an existing account by email. People without an account get an invite link instead. */
export const POST = handler<Params>(async ({ req, user, params, ip }) => {
  const server = await manageable(user, params.id);
  const { email } = await parseBody(req, z.object({ email: emailSchema }));
  const target = await db.user.findUnique({ where: { email } });
  if (!target) throw new ApiError(404, "No account uses this email. Create an invite link and send it to them instead.");
  if (target.id === server.ownerId) throw new ApiError(409, "This user already owns the server");
  await db.serverMember.upsert({
    where: { serverId_userId: { serverId: server.id, userId: target.id } },
    create: { serverId: server.id, userId: target.id },
    update: {},
  });
  await logActivity({ action: "server.member.add", message: `Added ${target.name} to ${server.name}`, userId: user.id, serverId: server.id, ip });
  const serverUrl = `${env().APP_URL.replace(/\/$/, "")}/servers/${server.id}`;
  const emailed = await sendTemplate("memberAdded", target.email, { userName: target.name, inviterName: user.name, serverName: server.name, serverUrl }).catch(() => false);
  return Response.json({ ok: true, emailed }, { status: 201 });
});

export const DELETE = handler<Params>(async ({ req, user, params, ip }) => {
  const server = await manageable(user, params.id);
  const memberId = req.nextUrl.searchParams.get("memberId");
  if (!memberId) throw new ApiError(400, "memberId is required");
  const member = await db.serverMember.findFirst({ where: { id: memberId, serverId: server.id }, include: { user: { select: { name: true } } } });
  if (!member) throw new ApiError(404, "Member not found");
  await db.serverMember.delete({ where: { id: member.id } });
  await logActivity({ action: "server.member.remove", message: `Removed ${member.user.name} from ${server.name}`, userId: user.id, serverId: server.id, ip });
  return undefined;
});
