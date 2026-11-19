import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handler, parseBody } from "@/lib/api";
import { generateApiToken } from "@/lib/session";
import { logActivity } from "@/lib/activity";

export const GET = handler(async ({ user }) => ({
  tokens: await db.apiToken.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true, expiresAt: true },
  }),
}));

const schema = z.object({ name: z.string().trim().min(1).max(64), expiresInDays: z.number().int().min(1).max(3650).nullable().default(null) });

export const POST = handler(async ({ req, user, auth, ip }) => {
  if (auth.via !== "session") throw new ApiError(403, "API tokens cannot create other tokens");
  const input = await parseBody(req, schema);
  if ((await db.apiToken.count({ where: { userId: user.id } })) >= 25) throw new ApiError(409, "Token limit reached (25)");
  const { token, prefix, tokenHash } = generateApiToken();
  const record = await db.apiToken.create({
    data: {
      name: input.name,
      prefix,
      tokenHash,
      userId: user.id,
      expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86400_000) : null,
    },
    select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true, expiresAt: true },
  });
  await logActivity({ action: "token.create", message: `Created API token "${input.name}"`, userId: user.id, ip });
  return Response.json({ token, record }, { status: 201 });
});

export const DELETE = handler(async ({ req, user, ip }) => {
  const id = z.string().parse(req.nextUrl.searchParams.get("id"));
  const { count } = await db.apiToken.deleteMany({ where: { id, userId: user.id } });
  if (count) await logActivity({ action: "token.delete", message: "Revoked an API token", userId: user.id, ip });
});
