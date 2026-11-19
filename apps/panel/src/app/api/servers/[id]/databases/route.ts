import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handler, parseBody } from "@/lib/api";
import { getServerForUser } from "@/lib/access";
import { encrypt } from "@/lib/crypto";
import { logActivity } from "@/lib/activity";
import { connectionInfo, connectionOf, createDatabase, databaseNames, newPassword } from "@/lib/databases";

type Params = { id: string };

export const GET = handler<Params>(async ({ user, params }) => {
  const server = await getServerForUser(user, params.id);
  const [databases, hosts] = await Promise.all([
    db.serverDatabase.findMany({ where: { serverId: server.id }, orderBy: { createdAt: "asc" }, include: { host: true } }),
    db.databaseHost.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { databases: true } } } }),
  ]);
  return {
    limit: server.databaseLimit,
    databases: databases.map((d) => ({
      id: d.id,
      name: d.name,
      username: d.username,
      remote: d.remote,
      createdAt: d.createdAt,
      engine: d.host.engine,
      hostName: d.host.name,
      ...connectionInfo(d.host, d),
    })),
    hosts: hosts
      .filter((h) => h.maxDatabases === null || h._count.databases < h.maxDatabases)
      .map((h) => ({ id: h.id, name: h.name, engine: h.engine, address: `${h.connectHost || h.host}:${h.port}` })),
  };
});

const createSchema = z.object({
  hostId: z.string().min(1),
  name: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{1,40}$/, "Use 1-40 lowercase letters, digits or _"),
  remote: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9.%_:-]{1,255}$/, "Allowed connections must be % or a host/IP pattern")
    .default("%"),
});

/** Creates a database and its own user on the chosen host; the password is returned once here (and on reveal). */
export const POST = handler<Params>(
  async ({ req, user, params, ip }) => {
    const server = await getServerForUser(user, params.id);
    const input = await parseBody(req, createSchema);
    const count = await db.serverDatabase.count({ where: { serverId: server.id } });
    if (count >= server.databaseLimit) throw new ApiError(409, `This server can have ${server.databaseLimit} database${server.databaseLimit === 1 ? "" : "s"}`);
    const host = await db.databaseHost.findUnique({ where: { id: input.hostId }, include: { _count: { select: { databases: true } } } });
    if (!host) throw new ApiError(404, "Database host not found");
    if (host.maxDatabases !== null && host._count.databases >= host.maxDatabases) throw new ApiError(409, `${host.name} is full`);
    const names = databaseNames(server.id, input.name);
    if (await db.serverDatabase.findFirst({ where: { hostId: host.id, name: names.name } })) throw new ApiError(409, "A database with this name already exists");
    const remote = host.engine === "MONGODB" ? "%" : input.remote;
    const password = newPassword();
    await createDatabase(connectionOf(host), { ...names, password, remote });
    const created = await db.serverDatabase.create({
      data: { serverId: server.id, hostId: host.id, ...names, remote, passwordEncrypted: encrypt(password) },
    });
    await logActivity({ action: "server.database.create", message: `Created database ${names.name} on ${host.name}`, userId: user.id, serverId: server.id, ip });
    return Response.json({ database: { id: created.id, ...names, password, ...connectionInfo(host, names, password) } }, { status: 201 });
  },
  { rateLimit: { limit: 20, windowSeconds: 300, bucket: "server-database" } },
);
