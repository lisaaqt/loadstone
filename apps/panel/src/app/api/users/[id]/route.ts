import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handler, notFound, parseBody } from "@/lib/api";
import { hashPassword } from "@/lib/crypto";
import { logActivity } from "@/lib/activity";
import { emailSchema, nameSchema, passwordSchema } from "@/lib/validation";

type Params = { id: string };

const updateSchema = z.object({
  name: nameSchema.optional(),
  email: emailSchema.optional(),
  role: z.enum(["ADMIN", "USER"]).optional(),
  password: passwordSchema.optional(),
});

async function ensureAnotherAdmin(excludeId: string) {
  const admins = await db.user.count({ where: { role: "ADMIN", id: { not: excludeId } } });
  if (admins === 0) throw new ApiError(409, "At least one administrator must remain");
}

export const PATCH = handler<Params>(
  async ({ req, user, params, ip }) => {
    const target = await db.user.findUnique({ where: { id: params.id } });
    if (!target) throw notFound("User");
    const input = await parseBody(req, updateSchema);
    if (input.role === "USER" && target.role === "ADMIN") await ensureAnotherAdmin(target.id);
    await db.user.update({
      where: { id: target.id },
      data: {
        name: input.name,
        email: input.email,
        role: input.role,
        ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
      },
    });
    if (input.password || input.role) await db.session.deleteMany({ where: { userId: target.id } });
    await logActivity({ action: "user.update", message: `Updated account ${target.email}`, userId: user.id, ip });
    return { ok: true };
  },
  { admin: true },
);

export const DELETE = handler<Params>(
  async ({ user, params, ip }) => {
    const target = await db.user.findUnique({ where: { id: params.id }, include: { _count: { select: { servers: true } } } });
    if (!target) throw notFound("User");
    if (target.id === user.id) throw new ApiError(409, "You cannot delete your own account");
    if (target.role === "ADMIN") await ensureAnotherAdmin(target.id);
    if (target._count.servers > 0) throw new ApiError(409, "Transfer or delete this user's servers first");
    await db.user.delete({ where: { id: target.id } });
    await logActivity({ action: "user.delete", message: `Deleted account ${target.email}`, userId: user.id, ip });
  },
  { admin: true },
);
