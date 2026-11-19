import { z } from "zod";
import { db } from "@/lib/db";
import { handler, parseBody } from "@/lib/api";
import { hashPassword } from "@/lib/crypto";
import { logActivity } from "@/lib/activity";
import { emailSchema, nameSchema, passwordSchema } from "@/lib/validation";

const userSelect = { id: true, name: true, email: true, role: true, createdAt: true, _count: { select: { servers: true } } } as const;

export const GET = handler(
  async () => ({ users: await db.user.findMany({ select: userSelect, orderBy: { createdAt: "asc" } }) }),
  { admin: true },
);

const createSchema = z.object({ name: nameSchema, email: emailSchema, password: passwordSchema, role: z.enum(["ADMIN", "USER"]).default("USER") });

export const POST = handler(
  async ({ req, user, ip }) => {
    const input = await parseBody(req, createSchema);
    const created = await db.user.create({
      data: { name: input.name, email: input.email, role: input.role, passwordHash: await hashPassword(input.password) },
      select: userSelect,
    });
    await logActivity({ action: "user.create", message: `Created ${input.role.toLowerCase()} account ${created.email}`, userId: user.id, ip });
    return Response.json({ user: created }, { status: 201 });
  },
  { admin: true },
);
