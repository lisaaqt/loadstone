import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, clientIp, errorResponse, json, parseBody } from "@/lib/api";
import { hashPassword } from "@/lib/crypto";
import { createSession } from "@/lib/session";
import { setSessionCookie } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity";
import { emailSchema, nameSchema, passwordSchema } from "@/lib/validation";

const schema = z.object({ name: nameSchema, email: emailSchema, password: passwordSchema });

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    if (!(await rateLimit(`setup:${ip}`, 10, 300)).allowed) throw new ApiError(429, "Too many requests");
    const input = await parseBody(req, schema);
    const passwordHash = await hashPassword(input.password);
    const user = await db.$transaction(
      async (tx) => {
        if ((await tx.user.count()) > 0) throw new ApiError(409, "Setup has already been completed");
        return tx.user.create({ data: { name: input.name, email: input.email, passwordHash, role: "ADMIN" } });
      },
      { isolationLevel: "Serializable" },
    );
    const { token, expiresAt } = await createSession(user.id, { ip, userAgent: req.headers.get("user-agent") });
    await setSessionCookie(token, expiresAt);
    await logActivity({ action: "auth.setup", message: `${user.name} completed initial setup`, userId: user.id, ip });
    return json({ ok: true }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
