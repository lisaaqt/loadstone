import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handler, parseBody } from "@/lib/api";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { logActivity } from "@/lib/activity";
import { emailSchema, nameSchema, passwordSchema } from "@/lib/validation";

const schema = z.object({
  name: nameSchema.optional(),
  email: emailSchema.optional(),
  currentPassword: z.string().max(256).optional(),
  newPassword: passwordSchema.optional(),
});

export const PATCH = handler(
  async ({ req, user, auth, ip }) => {
    const input = await parseBody(req, schema);
    const record = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    const sensitive = input.newPassword || (input.email && input.email !== record.email);
    if (sensitive && !(input.currentPassword && (await verifyPassword(input.currentPassword, record.passwordHash))))
      throw new ApiError(403, "Your current password is incorrect");
    await db.user.update({
      where: { id: user.id },
      data: {
        name: input.name,
        email: input.email,
        ...(input.newPassword ? { passwordHash: await hashPassword(input.newPassword) } : {}),
      },
    });
    if (input.newPassword) {
      await db.session.deleteMany({ where: { userId: user.id, ...(auth.sessionId ? { id: { not: auth.sessionId } } : {}) } });
    }
    await logActivity({ action: "account.update", message: `${user.name} updated their account`, userId: user.id, ip });
    return { ok: true };
  },
  { rateLimit: { limit: 10, windowSeconds: 60, bucket: "account" } },
);
