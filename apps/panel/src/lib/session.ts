import type { Role } from "@/generated/prisma/client";
import { db } from "./db";
import { randomToken, sha256 } from "./crypto";

export const SESSION_COOKIE = "ls_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface AuthContext {
  user: AuthUser;
  sessionId: string | null;
  via: "session" | "token";
}

const userSelect = { id: true, email: true, name: true, role: true } as const;

export async function createSession(userId: string, meta: { ip?: string | null; userAgent?: string | null }) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 512) ?? null,
    },
  });
  return { token, expiresAt };
}

export async function validateSessionToken(token: string | undefined | null): Promise<AuthContext | null> {
  if (!token || token.length > 128) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { select: userSelect } },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.session
      .update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
      })
      .catch(() => undefined);
  }
  return { user: session.user, sessionId: session.id, via: "session" };
}

export async function validateApiToken(token: string): Promise<AuthContext | null> {
  if (!token.startsWith("ls_") || token.length > 128) return null;
  const record = await db.apiToken.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { select: userSelect } },
  });
  if (!record) return null;
  if (record.expiresAt && record.expiresAt.getTime() < Date.now()) return null;
  if (!record.lastUsedAt || Date.now() - record.lastUsedAt.getTime() > 60_000) {
    await db.apiToken.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  }
  return { user: record.user, sessionId: null, via: "token" };
}

export function generateApiToken() {
  const prefix = randomToken(6).replace(/[^A-Za-z0-9]/g, "x").slice(0, 8);
  const token = `ls_${prefix}_${randomToken(32)}`;
  return { token, prefix: `ls_${prefix}`, tokenHash: sha256(token) };
}

export async function destroySessionToken(token: string) {
  await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
}

export function parseCookieHeader(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}
