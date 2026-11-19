import { db } from "@/lib/db";
import { ApiError, handler, parseBody } from "@/lib/api";
import { decrypt, encrypt } from "@/lib/crypto";
import { logActivity } from "@/lib/activity";
import { hostInputSchema, testHost } from "@/lib/databases";

type Params = { id: string };
const MASK = "••••••••";

async function load(id: string) {
  const host = await db.databaseHost.findUnique({ where: { id } });
  if (!host) throw new ApiError(404, "Database host not found");
  return host;
}

/** Updates a host; the password stays unchanged when the masked value is sent back. Re-tests the login. */
export const PATCH = handler<Params>(
  async ({ req, user, params, ip }) => {
    const host = await load(params.id);
    const input = await parseBody(req, hostInputSchema);
    const password = input.password === MASK || input.password === "" ? decrypt(host.passwordEncrypted) : input.password;
    if (input.engine !== host.engine && (await db.serverDatabase.count({ where: { hostId: host.id } })) > 0) {
      throw new ApiError(409, "The engine can't be changed while the host has databases");
    }
    const version = await testHost({ engine: input.engine, host: input.host, port: input.port, username: input.username, password });
    const { password: _formPassword, ...fields } = input;
    const updated = await db.databaseHost.update({
      where: { id: host.id },
      data: { ...fields, connectHost: fields.connectHost || null, maxDatabases: fields.maxDatabases ?? null, passwordEncrypted: encrypt(password) },
    });
    await logActivity({ action: "database-host.update", message: `Updated database host ${updated.name}`, userId: user.id, ip });
    return { ok: true, version };
  },
  { admin: true },
);

export const DELETE = handler<Params>(
  async ({ user, params, ip }) => {
    const host = await load(params.id);
    const count = await db.serverDatabase.count({ where: { hostId: host.id } });
    if (count > 0) throw new ApiError(409, `Delete the ${count} database(s) on this host first`);
    await db.databaseHost.delete({ where: { id: host.id } });
    await logActivity({ action: "database-host.delete", message: `Removed database host ${host.name}`, userId: user.id, ip });
    return undefined;
  },
  { admin: true },
);
