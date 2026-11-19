import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, clientIp, errorResponse, json, parseBody } from "@/lib/api";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { createSession } from "@/lib/session";
import { setSessionCookie } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity";
import { emailSchema } from "@/lib/validation";

const schema = z.object({ email: emailSchema, password: z.string().min(1).max(256) });

let dummyHash: Promise<string> | null = null;

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    const { email, password } = await parseBody(req, schema);
    const [byIp, byEmail] = await Promise.all([rateLimit(`login:ip:${ip}`, 20, 300), rateLimit(`login:email:${email}`, 8, 300)]);
    if (!byIp.allowed || !byEmail.allowed) throw new ApiError(429, "Too many sign-in attempts. Try again in a few minutes.");

    const user = await db.user.findUnique({ where: { email } });
    dummyHash ??= hashPassword("loadstone-timing-equalizer");
    const valid = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
    if (!user || !valid) {
      await logActivity({ action: "auth.failed", message: `Failed sign-in attempt for ${email}`, ip });
      throw new ApiError(401, "Invalid email or password");
    }

    const { token, expiresAt } = await createSession(user.id, { ip, userAgent: req.headers.get("user-agent") });
    await setSessionCookie(token, expiresAt);
    await logActivity({ action: "auth.login", message: `${user.name} signed in`, userId: user.id, ip });
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
