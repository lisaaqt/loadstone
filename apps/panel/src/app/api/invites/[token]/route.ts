import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, clientIp, errorResponse, isSameOriginRequest, json, parseBody } from "@/lib/api";
import { hashPassword, sha256 } from "@/lib/crypto";
import { createSession } from "@/lib/session";
import { getCurrentUser, setSessionCookie } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity";
import { emailSchema, nameSchema, passwordSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ token: string }> };

async function findInvite(token: string) {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) return null;
  const invite = await db.serverInvite.findUnique({ where: { tokenHash: sha256(token) }, include: { server: { select: { id: true, name: true, ownerId: true } } } });
  if (!invite || invite.usedAt || invite.expiresAt < new Date()) return null;
  return invite;
}

/** Public: tells the invite page which server the link is for. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const invite = await findInvite((await params).token);
  if (!invite) return json({ error: "This invite link is invalid or has expired" }, { status: 404 });
  return json({ server: { name: invite.server.name } });
}

const signupSchema = z.object({ name: nameSchema, email: emailSchema, password: passwordSchema });

/** Accepts an invite: signed-in users join directly, new people create a member account with the link. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    if (!isSameOriginRequest(req.headers)) throw new ApiError(403, "Cross-origin request blocked");
    const ip = clientIp(req);
    if (!(await rateLimit(`invite:${ip}`, 10, 300)).allowed) throw new ApiError(429, "Too many requests");
    const invite = await findInvite((await params).token);
    if (!invite) throw new ApiError(404, "This invite link is invalid or has expired");

    let user = await getCurrentUser();
    let created = false;
    if (!user) {
      const input = await parseBody(req, signupSchema);
      if (await db.user.findUnique({ where: { email: input.email } })) throw new ApiError(409, "An account with this email already exists. Sign in first, then open the invite link again.");
      user = await db.user.create({
        data: { name: input.name, email: input.email, passwordHash: await hashPassword(input.password), role: "USER" },
        select: { id: true, email: true, name: true, role: true },
      });
      created = true;
    }

    const used = await db.serverInvite.updateMany({ where: { id: invite.id, usedAt: null }, data: { usedAt: new Date() } });
    if (used.count === 0) throw new ApiError(410, "This invite link has already been used");
    if (user.id !== invite.server.ownerId) {
      await db.serverMember.upsert({
        where: { serverId_userId: { serverId: invite.server.id, userId: user.id } },
        create: { serverId: invite.server.id, userId: user.id },
        update: {},
      });
    }
    if (created) {
      const { token, expiresAt } = await createSession(user.id, { ip, userAgent: req.headers.get("user-agent") });
      await setSessionCookie(token, expiresAt);
    }
    await logActivity({ action: "server.invite.accept", message: `${user.name} joined ${invite.server.name} via invite`, userId: user.id, serverId: invite.server.id, ip });
    return json({ serverId: invite.server.id });
  } catch (err) {
    return errorResponse(err);
  }
}
