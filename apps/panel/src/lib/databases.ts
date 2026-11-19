import { randomBytes } from "node:crypto";
import type { DatabaseEngine, DatabaseHost } from "@/generated/prisma/client";
import { decrypt } from "./crypto";
import { ApiError } from "./api";
import { z } from "zod";

export const hostInputSchema = z.object({
  name: z.string().trim().min(1).max(64),
  engine: z.enum(["MYSQL", "MARIADB", "MONGODB"]),
  host: z.string().trim().min(1).max(253),
  port: z.number().int().min(1).max(65535),
  username: z.string().trim().min(1).max(128),
  password: z.string().max(1024),
  connectHost: z.string().trim().max(253).optional().nullable(),
  maxDatabases: z.number().int().min(0).max(100000).nullable().optional(),
});

export interface HostConnection {
  engine: DatabaseEngine;
  host: string;
  port: number;
  username: string;
  password: string;
}

export const DEFAULT_PORTS: Record<DatabaseEngine, number> = { MYSQL: 3306, MARIADB: 3306, MONGODB: 27017 };

export const connectionOf = (h: DatabaseHost): HostConnection => ({
  engine: h.engine,
  host: h.host,
  port: h.port,
  username: h.username,
  password: decrypt(h.passwordEncrypted),
});

/** Database and user names: s<server prefix>_<name> / u<server prefix>_<random>, like Pterodactyl. */
export function databaseNames(serverId: string, name: string) {
  const prefix = serverId.replace(/[^a-z0-9]/g, "").slice(-8);
  return { name: `s${prefix}_${name}`.slice(0, 64), username: `u${prefix}_${randomBytes(4).toString("hex")}` };
}

export const newPassword = () => randomBytes(18).toString("base64url");

const fail = (action: string, err: unknown): never => {
  throw new ApiError(502, `Database host error while ${action}: ${err instanceof Error ? err.message : String(err)}`);
};

async function withMysql<T>(c: HostConnection, fn: (q: (sql: string, params?: unknown[]) => Promise<unknown>) => Promise<T>) {
  const mysql = await import("mysql2/promise");
  const conn = await mysql.createConnection({ host: c.host, port: c.port, user: c.username, password: c.password, connectTimeout: 8000, multipleStatements: false });
  try {
    return await fn((sql, params) => conn.query(sql, params));
  } finally {
    await conn.end().catch(() => undefined);
  }
}

async function withMongo<T>(c: HostConnection, fn: (client: import("mongodb").MongoClient) => Promise<T>) {
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(`mongodb://${c.host}:${c.port}/`, {
    auth: { username: c.username, password: c.password },
    authSource: "admin",
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => undefined);
  }
}

/** Connects with the admin account and checks it may create databases and users. */
export async function testHost(c: HostConnection) {
  try {
    if (c.engine === "MONGODB") {
      return await withMongo(c, async (client) => {
        const info = (await client.db("admin").command({ buildInfo: 1 })) as { version: string };
        return `MongoDB ${info.version}`;
      });
    }
    return await withMysql(c, async (q) => {
      const [rows] = (await q("SELECT VERSION() AS v")) as [{ v: string }[]];
      return `${c.engine === "MARIADB" ? "MariaDB" : "MySQL"} ${rows[0]?.v ?? ""}`.trim();
    });
  } catch (err) {
    return fail("connecting", err);
  }
}

export async function createDatabase(c: HostConnection, db: { name: string; username: string; password: string; remote: string }) {
  try {
    if (c.engine === "MONGODB") {
      await withMongo(c, (client) => client.db(db.name).command({ createUser: db.username, pwd: db.password, roles: [{ role: "dbOwner", db: db.name }] }));
      return;
    }
    await withMysql(c, async (q) => {
      await q("CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci", [db.name]);
      await q("CREATE USER ?@? IDENTIFIED BY ?", [db.username, db.remote, db.password]);
      await q("GRANT ALL PRIVILEGES ON ??.* TO ?@?", [db.name, db.username, db.remote]);
      await q("FLUSH PRIVILEGES");
    });
  } catch (err) {
    await dropDatabase(c, db).catch(() => undefined);
    fail("creating the database", err);
  }
}

export async function rotatePassword(c: HostConnection, db: { name: string; username: string; remote: string }, password: string) {
  try {
    if (c.engine === "MONGODB") {
      await withMongo(c, (client) => client.db(db.name).command({ updateUser: db.username, pwd: password }));
      return;
    }
    await withMysql(c, async (q) => {
      await q("ALTER USER ?@? IDENTIFIED BY ?", [db.username, db.remote, password]);
      await q("FLUSH PRIVILEGES");
    });
  } catch (err) {
    fail("changing the password", err);
  }
}

export async function dropDatabase(c: HostConnection, db: { name: string; username: string; remote: string }) {
  try {
    if (c.engine === "MONGODB") {
      await withMongo(c, async (client) => {
        await client.db(db.name).command({ dropUser: db.username }).catch(() => undefined);
        await client.db(db.name).dropDatabase();
      });
      return;
    }
    await withMysql(c, async (q) => {
      await q("DROP DATABASE IF EXISTS ??", [db.name]);
      await q("DROP USER IF EXISTS ?@?", [db.username, db.remote]);
      await q("FLUSH PRIVILEGES");
    });
  } catch (err) {
    fail("deleting the database", err);
  }
}

/** Connection details shown to users. */
export function connectionInfo(host: Pick<DatabaseHost, "engine" | "host" | "port" | "connectHost">, db: { name: string; username: string }, password?: string) {
  const address = host.connectHost || host.host;
  const pw = password ? encodeURIComponent(password) : "<password>";
  return {
    address: `${address}:${host.port}`,
    url:
      host.engine === "MONGODB"
        ? `mongodb://${encodeURIComponent(db.username)}:${pw}@${address}:${host.port}/${db.name}?authSource=${db.name}`
        : `jdbc:${host.engine === "MARIADB" ? "mariadb" : "mysql"}://${address}:${host.port}/${db.name}`,
  };
}
