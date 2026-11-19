import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { notFound } from "./api";
import { agentFor } from "./agent-client";
import type { AuthUser } from "./session";

export function serverScope(user: AuthUser): Prisma.ServerWhereInput {
  return user.role === "ADMIN" ? {} : { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] };
}

/** Owners and admins can manage members, reinstall and delete; invited members can use everything else. */
export function canManageServer(user: AuthUser, server: { ownerId: string }) {
  return user.role === "ADMIN" || server.ownerId === user.id;
}

/** States in which the server is locked: nothing but the header is shown and power actions are blocked. */
export const LOCKED_STATES = ["INSTALLING", "RESTORING"] as const;
export const isLocked = (state: string) => (LOCKED_STATES as readonly string[]).includes(state);

export async function getServerForUser(user: AuthUser, serverId: string) {
  const server = await db.server.findFirst({
    where: { id: serverId, ...serverScope(user) },
    include: { node: true },
  });
  if (!server) throw notFound("Server");
  return server;
}

export async function serverWithAgent(user: AuthUser, serverId: string) {
  const server = await getServerForUser(user, serverId);
  return { server, agent: agentFor(server.node), base: `/api/servers/${server.id}` };
}

export type ServerWithNode = Awaited<ReturnType<typeof getServerForUser>>;
