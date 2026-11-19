import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { secureCookies } from "./env";
import { SESSION_COOKIE, validateSessionToken, type AuthUser } from "./session";

export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const store = await cookies();
  const ctx = await validateSessionToken(store.get(SESSION_COOKIE)?.value);
  return ctx?.user ?? null;
});

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
