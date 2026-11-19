import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { handler, parseQuery } from "@/lib/api";
import { serverScope } from "@/lib/access";

const schema = z.object({
  serverId: z.string().max(40).optional(),
  cursor: z.string().max(40).optional(),
  q: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const GET = handler(async ({ req, user }) => {
  const input = parseQuery(req, schema);
  const where: Prisma.ActivityWhereInput = {
    ...(user.role === "ADMIN" ? {} : { OR: [{ userId: user.id }, { server: serverScope(user) }] }),
    ...(input.serverId ? { serverId: input.serverId } : {}),
    ...(input.q ? { message: { contains: input.q, mode: "insensitive" } } : {}),
  };
  const items = await db.activity.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    include: { user: { select: { id: true, name: true } }, server: { select: { id: true, name: true } } },
  });
  const hasMore = items.length > input.limit;
  const page = hasMore ? items.slice(0, -1) : items;
  return { items: page, nextCursor: hasMore ? page[page.length - 1]?.id : null };
});
