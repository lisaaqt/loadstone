import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handler, parseBody } from "@/lib/api";
import { agentFor } from "@/lib/agent-client";
import { getSftpSettings, sftpSettingsSchema } from "@/lib/settings";

const MASK = "••••••••";

/** Tests SFTP settings from an online node, because agents (not the panel) upload the backups. */
export const POST = handler(
  async ({ req }) => {
    const { sftp } = await parseBody(req, z.object({ sftp: sftpSettingsSchema }));
    const current = await getSftpSettings();
    const keep = (input: string, saved: string) => (input === MASK ? saved : input);
    const password = keep(sftp.password, current.password);
    const privateKey = keep(sftp.privateKey, current.privateKey);
    const passphrase = keep(sftp.passphrase, current.passphrase);
    if (!sftp.host || !sftp.username) throw new ApiError(422, "Enter a host and a username");
    if (sftp.authMethod === "password" ? !password : !privateKey) throw new ApiError(422, sftp.authMethod === "password" ? "Enter a password" : "Paste a private key");

    const node = await db.node.findFirst({ where: { status: "ONLINE" }, orderBy: { lastSeenAt: "desc" } });
    if (!node) throw new ApiError(409, "No online node is available to run the test from");
    await agentFor(node).request("/api/storage/sftp/test", {
      method: "POST",
      timeoutMs: 30_000,
      json: {
        host: sftp.host,
        port: sftp.port,
        username: sftp.username,
        ...(sftp.authMethod === "key" ? { privateKey, passphrase: passphrase || undefined } : { password }),
        path: sftp.path || "/loadstone",
      },
    });
    return { ok: true, node: node.name };
  },
  { admin: true, rateLimit: { limit: 10, windowSeconds: 60, bucket: "sftp-test" } },
);
