import type { Metadata } from "next";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { getCurrentUser } from "@/lib/auth";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Invitation" };
export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = /^[A-Za-z0-9_-]{16,128}$/.test(token);
  const invite = valid
    ? await db.serverInvite.findUnique({ where: { tokenHash: sha256(token) }, include: { server: { select: { name: true } } } })
    : null;
  const usable = invite && !invite.usedAt && invite.expiresAt > new Date();
  const user = await getCurrentUser();

  return (
    <>
      <div className="mb-7 text-center lg:text-left">
        <h1 className="text-2xl font-semibold tracking-[-0.03em]">{usable ? `Join ${invite.server.name}` : "Invite not available"}</h1>
        <p className="mt-1.5 text-sm text-muted">
          {usable
            ? user
              ? `You're signed in as ${user.name}. Accept to get access to this server.`
              : "You've been invited to manage this Minecraft server. Create your account to continue."
            : "This invite link is invalid, was already used, or has expired. Ask the server owner for a new one."}
        </p>
      </div>
      {usable && <InviteForm token={token} signedIn={Boolean(user)} />}
    </>
  );
}
