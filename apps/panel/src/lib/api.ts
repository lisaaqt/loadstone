import type { NextRequest } from "next/server";
import { flattenError, ZodError, type output, type ZodType } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { env } from "./env";
import { rateLimit } from "./rate-limit";
import { SESSION_COOKIE, validateApiToken, validateSessionToken, type AuthContext, type AuthUser } from "./session";
import { AgentError } from "./agent-client";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = "Resource") => new ApiError(404, `${what} not found`);
export const forbidden = () => new ApiError(403, "You do not have permission to perform this action");
export const badRequest = (message: string, details?: unknown) => new ApiError(400, message, details);

export function serialize(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? Number(v) : v));
}

export function json(value: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(serialize(value), { ...init, headers });
}

export function clientIp(req: Request): string {
  if (env().TRUST_PROXY) {
    const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
    const real = req.headers.get("x-real-ip");
    if (real) return real;
  }
  return req.headers.get("x-loadstone-remote-addr") ?? "unknown";
}

export async function authenticate(req: NextRequest): Promise<AuthContext | null> {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return validateApiToken(header.slice(7).trim());
  return validateSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isSameOriginRequest(headers: { get(name: string): string | null }): boolean {
  // Fetch Metadata is set by the browser and cannot be forged by page scripts. It stays correct behind
  // reverse proxies and port forwards, where Origin and Host legitimately differ.
  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite) return fetchSite === "same-origin" || fetchSite === "none";
  const origin = headers.get("origin");
  if (!origin) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  return allowedHosts(headers).has(originHost);
}

function allowedHosts(headers: { get(name: string): string | null }) {
  const hosts = new Set<string>([new URL(env().APP_URL).host, ...env().ALLOWED_ORIGINS]);
  const host = headers.get("host");
  if (host) hosts.add(host);
  if (env().TRUST_PROXY) {
    const fwd = headers.get("x-forwarded-host");
    if (fwd) hosts.add(fwd);
  }
  return hosts;
}

function checkOrigin(req: NextRequest) {
  if (!isSameOriginRequest(req.headers)) throw new ApiError(403, "Cross-site request blocked");
}

export interface HandlerContext<P> {
  req: NextRequest;
  params: P;
  user: AuthUser;
  auth: AuthContext;
  ip: string;
}

interface HandlerOptions {
  admin?: boolean;
  rateLimit?: { limit: number; windowSeconds: number; bucket?: string };
}

type RouteContext<P> = { params: Promise<P> };

export function handler<P extends Record<string, string> = Record<string, never>>(
  fn: (ctx: HandlerContext<P>) => Promise<unknown>,
  options: HandlerOptions = {},
) {
  return async (req: NextRequest, context: RouteContext<P>): Promise<Response> => {
    try {
      const auth = await authenticate(req);
      if (!auth) throw new ApiError(401, "Authentication required");
      if (auth.via === "session" && !SAFE_METHODS.has(req.method)) checkOrigin(req);
      if (options.admin && auth.user.role !== "ADMIN") throw forbidden();
      const ip = clientIp(req);
      const limit = options.rateLimit ?? (SAFE_METHODS.has(req.method) ? { limit: 600, windowSeconds: 60 } : { limit: 120, windowSeconds: 60 });
      const rl = await rateLimit(`${limit.bucket ?? "api"}:${auth.user.id}`, limit.limit, limit.windowSeconds);
      if (!rl.allowed) {
        return json({ error: "Too many requests, slow down." }, { status: 429, headers: { "retry-after": String(rl.resetSeconds) } });
      }
      const params = (await context.params) ?? ({} as P);
      const result = await fn({ req, params, user: auth.user, auth, ip });
      if (result instanceof Response) return result;
      if (result === undefined) return new Response(null, { status: 204 });
      return json(result);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) return json({ error: err.message, details: err.details }, { status: err.status });
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const message = first ? `${first.path.length ? `${first.path.join(".")}: ` : ""}${first.message}` : "Invalid input";
    return json({ error: message, details: flattenError(err) }, { status: 422 });
  }
  if (err instanceof AgentError) {
    const status = err.status >= 400 && err.status < 500 ? err.status : 502;
    return json({ error: err.message }, { status });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return json({ error: "A record with these values already exists" }, { status: 409 });
    if (err.code === "P2025") return json({ error: "Resource not found" }, { status: 404 });
  }
  console.error("[api] unhandled error", err);
  return json({ error: "Internal server error" }, { status: 500 });
}

export async function parseBody<S extends ZodType>(req: Request, schema: S): Promise<output<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw badRequest("Request body must be valid JSON");
  }
  return schema.parse(raw);
}

export function parseQuery<S extends ZodType>(req: NextRequest, schema: S): output<S> {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
}
