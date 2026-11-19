import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handler, parseBody } from "@/lib/api";
import { canManageServer, getServerForUser } from "@/lib/access";
import { logActivity } from "@/lib/activity";
import { randomToken, sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { sendTemplate } from "@/lib/mail";
import { emailSchema } from "@/lib/validation";

type Params = { id: string };

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Creates a single-use invite link (valid 7 days), optionally emailed. The token is only returned once and stored hashed. */
export const POST = handler<Params>(
  async ({ req, user, params, ip }) => {
    const { email } = await parseBody(req, z.object({ email: emailSchema.optional() }));
    const server = await getServerForUser(user, params.id);
    if (!canManageServer(user, server)) throw new ApiError(403, "Only the owner or an administrator can invite members");
    const token = randomToken(24);
    const invite = await db.serverInvite.create({
      data: { serverId: server.id, tokenHash: sha256(token), createdById: user.id, expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
    });
    await logActivity({ action: "server.invite.create", message: `Created an invite link for ${server.name}`, userId: user.id, serverId: server.id, ip });
    const url = `${env().APP_URL.replace(/\/$/, "")}/invite/${token}`;
    let emailed = false;
    if (email) {
      try {
        emailed = await sendTemplate("invite", email, { inviterName: user.name, serverName: server.name, inviteUrl: url, expiresAt: formatDate(invite.expiresAt) });
      } catch (err) {
        throw new ApiError(502, `The invite was created, but the email could not be sent: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return Response.json({ id: invite.id, url, expiresAt: invite.expiresAt, emailed }, { status: 201 });
  },
  { rateLimit: { limit: 20, windowSeconds: 3600, bucket: "server-invite" } },
);

export const DELETE = handler<Params>(async ({ req, user, params }) => {
  const server = await getServerForUser(user, params.id);
  if (!canManageServer(user, server)) throw new ApiError(403, "Only the owner or an administrator can revoke invites");
  const id = req.nextUrl.searchParams.get("inviteId");
  if (!id) throw new ApiError(400, "inviteId is required");
  await db.serverInvite.deleteMany({ where: { id, serverId: server.id } });
  return undefined;
});
