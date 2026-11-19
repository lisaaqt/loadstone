import { z } from "zod";
import { db } from "@/lib/db";
import { handler } from "@/lib/api";

export const GET = handler(async ({ user, auth }) => {
  const sessions = await db.session.findMany({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, ip: true, userAgent: true, createdAt: true, lastSeenAt: true },
  });
  return { sessions: sessions.map((s) => ({ ...s, current: s.id === auth.sessionId })) };
});

export const DELETE = handler(async ({ req, user, auth }) => {
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    await db.session.deleteMany({ where: { id: z.string().parse(id), userId: user.id } });
  } else {
    await db.session.deleteMany({ where: { userId: user.id, ...(auth.sessionId ? { id: { not: auth.sessionId } } : {}) } });
  }
});
