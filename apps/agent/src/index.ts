import { createHash, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import type { Readable } from "node:stream";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import websocket from "@fastify/websocket";
import { z, ZodError } from "zod";
import {
  AGENT_VERSION,
  backupLocationSchema,
  backupRequestSchema,
  commandSchema,
  pluginInstallSchema,
  powerActionSchema,
  serverSpecSchema,
  sftpConfigSchema,
} from "@loadstone/shared";
import { config } from "./config.js";
import { HttpError } from "./errors.js";
import { assertId } from "./paths.js";
import * as dockerOps from "./docker.js";
import * as files from "./files.js";
import * as worlds from "./worlds.js";
import * as backups from "./backups.js";
import * as sftp from "./sftp.js";
import { installPlugin } from "./plugins.js";
import { getOperation } from "./operations.js";
import { systemInfo } from "./system.js";
import { startImagePrepull } from "./prepull.js";
import { attachConsole } from "./console.js";

for (const dir of Object.values(config.dirs)) fs.mkdirSync(dir, { recursive: true });

const https = config.tlsCert && config.tlsKey ? { cert: fs.readFileSync(config.tlsCert), key: fs.readFileSync(config.tlsKey) } : null;

const app = Fastify({
  logger: { level: config.logLevel },
  bodyLimit: 8 * 1024 * 1024,
  trustProxy: false,
  ...(https ? { https } : {}),
});

const tokenDigest = createHash("sha256").update(config.token).digest();

function authorized(header: string | undefined) {
  if (!header?.startsWith("Bearer ")) return false;
  const digest = createHash("sha256").update(header.slice(7)).digest();
  return timingSafeEqual(digest, tokenDigest);
}

app.addHook("onRequest", async (req, reply) => {
  if (req.url === "/health") return;
  if (!authorized(req.headers.authorization)) {
    await new Promise((r) => setTimeout(r, 250));
    return reply.code(401).send({ error: "Unauthorized" });
  }
});

app.addContentTypeParser("application/octet-stream", (_req, payload, done) => done(null, payload));

app.setErrorHandler((err: unknown, req, reply) => {
  if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
  if (err instanceof ZodError) return reply.code(422).send({ error: err.issues[0]?.message ?? "Invalid request" });
  const e = err as { statusCode?: number; message?: string; json?: { message?: string } };
  const status = e.statusCode && e.statusCode >= 400 && e.statusCode < 600 ? e.statusCode : 500;
  if (status >= 500) req.log.error(err);
  return reply.code(status).send({ error: e.json?.message ?? e.message ?? "Internal error" });
});

await app.register(websocket, { options: { maxPayload: 64 * 1024 } });

type IdParams = { id: string };
const sid = (req: FastifyRequest) => assertId((req.params as IdParams).id, "server id");
const query = <T extends z.ZodTypeAny>(req: FastifyRequest, schema: T): z.infer<T> => schema.parse(req.query);
const body = <T extends z.ZodTypeAny>(req: FastifyRequest, schema: T): z.infer<T> => schema.parse(req.body);

function sendStream(reply: FastifyReply, stream: Readable, opts: { name?: string; size?: number; type?: string }) {
  reply.header("content-type", opts.type ?? "application/octet-stream");
  if (opts.name) reply.header("x-file-name", encodeURIComponent(opts.name).replace(/%20/g, " "));
  if (opts.size !== undefined) reply.header("content-length", String(opts.size));
  return reply.send(stream);
}

const pathQuery = z.object({ path: z.string().max(1024).default("/") });

app.get("/health", async () => ({ ok: true, version: AGENT_VERSION }));
app.get("/api/system", async () => systemInfo());
app.get("/api/servers", async () => ({ containers: await dockerOps.listContainers() }));

app.post("/api/servers/:id/install", async (req) => {
  const id = sid(req);
  const { spec } = body(req, z.object({ spec: serverSpecSchema }));
  const containerId = await dockerOps.createContainer(id, spec);
  return { containerId };
});

app.post("/api/storage/sftp/test", async (req) => {
  try {
    await sftp.testConnection(body(req, sftpConfigSchema));
    return { ok: true };
  } catch (err) {
    throw new HttpError(502, err instanceof Error ? err.message : String(err));
  }
});

app.post("/api/servers/:id/network", async (req) => dockerOps.joinServerNetwork(sid(req)));

app.post("/api/servers/:id/wipe", async (req, reply) => {
  await dockerOps.wipeServer(sid(req));
  return reply.code(204).send();
});

app.delete("/api/servers/:id", async (req, reply) => {
  await dockerOps.removeServer(sid(req));
  return reply.code(204).send();
});

app.post("/api/servers/:id/power", async (req, reply) => {
  const id = sid(req);
  const { action, spec } = body(req, powerActionSchema.extend({ spec: serverSpecSchema.optional() }));
  dockerOps.power(id, action, spec);
  return reply.code(202).send({ accepted: true });
});

app.get("/api/servers/:id/stats", async (req) => dockerOps.stats(sid(req)));

app.post("/api/servers/:id/command", async (req) => {
  const id = sid(req);
  const { command, quiet } = body(req, commandSchema.extend({ quiet: z.boolean().optional() }));
  return { output: await dockerOps.sendCommand(id, command, quiet) };
});

app.get("/api/servers/:id/logs", async (req, reply) => {
  const { lines } = query(req, z.object({ lines: z.coerce.number().int().min(1).max(50_000).default(5000) }));
  reply.header("content-type", "text/plain; charset=utf-8");
  return dockerOps.logs(sid(req), lines);
});

app.get("/api/servers/:id/console", { websocket: true }, (socket, req) => {
  attachConsole(socket, sid(req));
});

app.get("/api/servers/:id/files/list", async (req) => ({ entries: await files.list(sid(req), query(req, pathQuery).path) }));
app.get("/api/servers/:id/files/content", async (req) => files.readText(sid(req), query(req, pathQuery).path));
app.get("/api/servers/:id/files/download", async (req, reply) => {
  const { stream, name, size } = await files.download(sid(req), query(req, pathQuery).path);
  return sendStream(reply, stream, { name, size });
});
app.post("/api/servers/:id/files/write", async (req) => {
  const { path, content } = body(req, z.object({ path: z.string().max(1024), content: z.string().max(5 * 1024 * 1024) }));
  await files.writeText(sid(req), path, content);
  return { ok: true };
});
app.post("/api/servers/:id/files/mkdir", async (req) => {
  await files.mkdir(sid(req), body(req, z.object({ path: z.string().max(1024) })).path);
  return { ok: true };
});
app.post("/api/servers/:id/files/rename", async (req) => {
  const { from, to } = body(req, z.object({ from: z.string().max(1024), to: z.string().max(1024) }));
  await files.rename(sid(req), from, to);
  return { ok: true };
});
app.post("/api/servers/:id/files/delete", async (req) => {
  await files.remove(sid(req), body(req, z.object({ paths: z.array(z.string().max(1024)).min(1).max(500) })).paths);
  return { ok: true };
});
app.post("/api/servers/:id/files/upload", async (req) => {
  const { path } = query(req, z.object({ path: z.string().min(1).max(1024) }));
  if (!req.body || typeof (req.body as Readable).pipe !== "function") throw new HttpError(415, "Expected application/octet-stream");
  return files.upload(sid(req), path, req.body as Readable);
});
app.post("/api/servers/:id/files/extract", async (req) => {
  const { path, destination } = body(req, z.object({ path: z.string().max(1024), destination: z.string().max(1024).optional() }));
  await files.extract(sid(req), path, destination);
  return { ok: true };
});
app.post("/api/servers/:id/files/compress", async (req) => {
  const { paths, destination } = body(req, z.object({ paths: z.array(z.string().max(1024)).min(1).max(500), destination: z.string().max(1024) }));
  await files.compress(sid(req), paths, destination);
  return { ok: true };
});
app.post("/api/servers/:id/cleanup", async (req) => files.cleanup(sid(req), body(req, z.object({ days: z.number().int().min(1).max(3650) })).days));

const worldName = z.object({ name: z.string().max(64) });
app.get("/api/servers/:id/worlds", async (req) => worlds.listWorlds(sid(req)));
app.post("/api/servers/:id/worlds/activate", async (req) => {
  await worlds.setActiveWorld(sid(req), body(req, worldName).name);
  return { ok: true };
});
app.post("/api/servers/:id/worlds/delete", async (req) => {
  await worlds.deleteWorld(sid(req), body(req, worldName).name);
  return { ok: true };
});
app.post("/api/servers/:id/worlds/import", async (req) => {
  const { name } = query(req, worldName);
  if (!req.body || typeof (req.body as Readable).pipe !== "function") throw new HttpError(415, "Expected application/octet-stream");
  await worlds.importWorld(sid(req), name, req.body as Readable);
  return { ok: true };
});
app.get("/api/servers/:id/worlds/export", async (req, reply) => {
  const { name } = query(req, worldName);
  return sendStream(reply, worlds.exportWorld(sid(req), name), { name: `${name}.zip`, type: "application/zip" });
});

type BackupParams = { id: string; backupId: string };
const bid = (req: FastifyRequest) => assertId((req.params as BackupParams).backupId, "backup id");

app.post("/api/servers/:id/backups", async (req, reply) => {
  const op = backups.createBackup(sid(req), body(req, backupRequestSchema));
  return reply.code(202).send(op);
});
app.post("/api/servers/:id/backups/:backupId/restore", async (req, reply) => {
  const op = await backups.restoreBackup(sid(req), bid(req), body(req, backupLocationSchema));
  return reply.code(202).send(op);
});
app.post("/api/servers/:id/backups/:backupId/download", async (req, reply) => {
  const { body: stream, size } = await backups.backupStream(sid(req), bid(req), body(req, backupLocationSchema));
  return sendStream(reply, stream, { size, type: "application/gzip" });
});
app.delete("/api/servers/:id/backups/:backupId", async (req, reply) => {
  await backups.deleteBackup(sid(req), bid(req), body(req, backupLocationSchema));
  return reply.code(204).send();
});

app.get("/api/operations/:opId", async (req) => {
  const { opId } = z.object({ opId: z.string().regex(/^(restore-)?[a-z0-9]{8,40}$/) }).parse(req.params);
  const op = getOperation(opId);
  if (!op) throw new HttpError(404, "Operation not found");
  return op;
});

app.post("/api/servers/:id/plugins/install", async (req) => installPlugin(sid(req), body(req, pluginInstallSchema)));

await fsp.rm(config.dirs.tmp, { recursive: true, force: true }).catch(() => undefined);
await fsp.mkdir(config.dirs.tmp, { recursive: true });

await app.listen({ host: config.host, port: config.port });
app.log.info(`Loadstone agent ${AGENT_VERSION} listening (${https ? "https" : "http"}), data dir ${config.dataDir}`);
for (const warning of await dockerOps.dockerEnvironmentWarnings()) app.log.warn(warning);
if (!(await dockerOps.joinAgentToServerNetwork())) app.log.info("not running in a container on this Docker host; RCON commands use rcon-cli");
startImagePrepull({ info: (m) => app.log.info(m), warn: (m) => app.log.warn(m) });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    app.log.info(`received ${signal}, shutting down`);
    void app.close().then(() => process.exit(0));
  });
}
