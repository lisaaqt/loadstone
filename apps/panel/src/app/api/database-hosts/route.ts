import { db } from "@/lib/db";
import { handler, parseBody } from "@/lib/api";
import { encrypt } from "@/lib/crypto";
import { logActivity } from "@/lib/activity";
import { hostInputSchema, testHost } from "@/lib/databases";

const publicHost = <T extends { passwordEncrypted: string }>({ passwordEncrypted: _pw, ...rest }: T) => rest;

export const GET = handler(
  async () => {
    const hosts = await db.databaseHost.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { databases: true } } } });
    return { hosts: hosts.map((h) => ({ ...publicHost(h), databaseCount: h._count.databases })) };
  },
  { admin: true },
);

/** Adds a host after checking the admin login works. */
export const POST = handler(
  async ({ req, user, ip }) => {
    const input = await parseBody(req, hostInputSchema);
    const version = await testHost({ engine: input.engine, host: input.host, port: input.port, username: input.username, password: input.password });
    const { password, ...fields } = input;
    const host = await db.databaseHost.create({
      data: { ...fields, connectHost: fields.connectHost || null, maxDatabases: fields.maxDatabases ?? null, passwordEncrypted: encrypt(password) },
    });
    await logActivity({ action: "database-host.create", message: `Added database host ${host.name} (${version})`, userId: user.id, ip });
    return Response.json({ host: publicHost(host), version }, { status: 201 });
  },
  { admin: true },
);
