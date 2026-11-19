import { db } from "@/lib/db";
import { ApiError, handler } from "@/lib/api";
import { getServerForUser } from "@/lib/access";
import { decrypt, encrypt } from "@/lib/crypto";
import { logActivity } from "@/lib/activity";
import { connectionInfo, connectionOf, dropDatabase, newPassword, rotatePassword } from "@/lib/databases";

type Params = { id: string; dbId: string };

async function load(user: Parameters<typeof getServerForUser>[0], params: Params) {
  const server = await getServerForUser(user, params.id);
  const database = await db.serverDatabase.findFirst({ where: { id: params.dbId, serverId: server.id }, include: { host: true } });
  if (!database) throw new ApiError(404, "Database not found");
  return { server, database };
}

/** Reveals the password and full connection string. */
export const GET = handler<Params>(async ({ user, params }) => {
  const { database } = await load(user, params);
  const password = decrypt(database.passwordEncrypted);
  return { password, ...connectionInfo(database.host, database, password) };
});

/** Rotates the password. */
export const POST = handler<Params>(async ({ user, params, ip }) => {
  const { server, database } = await load(user, params);
  const password = newPassword();
  await rotatePassword(connectionOf(database.host), database, password);
  await db.serverDatabase.update({ where: { id: database.id }, data: { passwordEncrypted: encrypt(password) } });
  await logActivity({ action: "server.database.rotate", message: `Rotated the password of ${database.name}`, userId: user.id, serverId: server.id, ip });
  return { password, ...connectionInfo(database.host, database, password) };
});

export const DELETE = handler<Params>(async ({ user, params, ip }) => {
  const { server, database } = await load(user, params);
  await dropDatabase(connectionOf(database.host), database);
  await db.serverDatabase.delete({ where: { id: database.id } });
  await logActivity({ action: "server.database.delete", message: `Deleted database ${database.name}`, userId: user.id, serverId: server.id, ip });
  return undefined;
});
