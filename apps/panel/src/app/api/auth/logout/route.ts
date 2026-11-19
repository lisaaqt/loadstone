import type { NextRequest } from "next/server";
import { errorResponse, json } from "@/lib/api";
import { clearSessionCookie } from "@/lib/auth";
import { destroySessionToken, SESSION_COOKIE } from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    if (token) await destroySessionToken(token);
    await clearSessionCookie();
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
