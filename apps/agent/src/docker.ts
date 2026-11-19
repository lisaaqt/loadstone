import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough, type Readable } from "node:stream";
import Docker from "dockerode";
import type { ContainerSummary, PowerAction, ServerRuntimeState, ServerSpec, ServerStats } from "@loadstone/shared";
import { config } from "./config.js";
import { conflict, HttpError, isErrno, notFound } from "./errors.js";
import { assertId, hostServerRoot, invalidateUsage, serverRoot, serverUsage } from "./paths.js";
import { repairOwnership } from "./ownership.js";
import { hub } from "./hub.js";
import { closeRcon, rconCommand, rconPassword } from "./rcon.js";

export const docker = new Docker();

const LABEL_SERVER = "io.loadstone.server";
const LABEL_SPEC = "io.loadstone.spec";
const stopping = new Set<string>();

export const containerName = (serverId: string) => `loadstone-${assertId(serverId)}`;

/** Bump when container settings change (e.g. security hardening) so existing containers are recreated on next start. */
const CONTAINER_LAYOUT_VERSION = 3;

function specHash(spec: ServerSpec) {
  return createHash("sha256").update(JSON.stringify({ spec, v: CONTAINER_LAYOUT_VERSION })).digest("hex").slice(0, 32);
}

const metaPath = (serverId: string) => path.join(config.dirs.meta, `${assertId(serverId)}.json`);

export async function saveSpec(serverId: string, spec: ServerSpec) {
  await fs.writeFile(metaPath(serverId), JSON.stringify(spec, null, 2));
}

export async function loadSpec(serverId: string): Promise<ServerSpec | null> {
  try {
    return JSON.parse(await fs.readFile(metaPath(serverId), "utf8")) as ServerSpec;
  } catch (err) {
    if (isErrno(err, "ENOENT")) return null;
    throw err;
  }
}

async function inspect(serverId: string) {
  try {
    return await docker.getContainer(containerName(serverId)).inspect();
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) return null;
    throw err;
  }
}

function runtimeState(info: Docker.ContainerInspectInfo | null, serverId: string): ServerRuntimeState {
  if (!info) return "missing";
  const s = info.State;
  if (stopping.has(serverId) && s.Running) return "stopping";
  if (s.Restarting) return "starting";
  if (!s.Running) return "offline";
  const health = s.Health?.Status;
  if (health === "starting") return "starting";
  return "running";
}

export async function getState(serverId: string): Promise<ServerRuntimeState> {
  return runtimeState(await inspect(serverId), serverId);
}

export async function listContainers(): Promise<ContainerSummary[]> {
  const containers = await docker.listContainers({ all: true, filters: { label: [LABEL_SERVER] } });
  return Promise.all(
    containers.map(async (c) => {
      const serverId = c.Labels[LABEL_SERVER]!;
      const state = c.State === "running" ? runtimeState(await inspect(serverId), serverId) : c.State === "restarting" ? "starting" : "offline";
      return { serverId, containerId: c.Id, state };
    }),
  );
}

const pulls = new Map<string, Promise<void>>();
const pullWatchers = new Map<string, Set<string>>();

export async function hasImage(image: string) {
  try {
    await docker.getImage(image).inspect();
    return true;
  } catch {
    return false;
  }
}

const isDockerHubImage = (image: string) => {
  const first = image.split("/")[0]!;
  return !image.includes("/") || first === "docker.io" || !(first.includes(".") || first.includes(":") || first === "localhost");
};

function pullAuth(image: string) {
  if (!config.dockerHubUsername || !config.dockerHubToken || !isDockerHubImage(image)) return {};
  return { authconfig: { username: config.dockerHubUsername, password: config.dockerHubToken, serveraddress: "https://index.docker.io/v1/" } };
}

function describePullError(image: string, message: string) {
  if (/toomanyrequests|rate limit/i.test(message)) {
    return `Docker Hub's download limit was reached while pulling ${image}. Wait a while and retry, or set DOCKER_HUB_USERNAME and DOCKER_HUB_TOKEN on the agent to raise the limit.`;
  }
  if (/no matching manifest/i.test(message)) return `${image} is not available for this server's CPU architecture (${process.arch}).`;
  if (/unauthorized|authentication required|denied/i.test(message)) return `Access to ${image} was denied by the registry (${message}). Check the image name or the agent's registry credentials.`;
  if (/no space left/i.test(message)) return `Not enough disk space on the node to download ${image}.`;
  return `Could not download ${image}: ${message}`;
}

const isPermanentPullError = (message: string) => /toomanyrequests|rate limit|no matching manifest|unauthorized|denied|not found|manifest unknown|no space left/i.test(message);

/** One pull attempt. Errors Docker reports inside the progress stream are turned into a rejection (dockerode ignores them). */
async function pullOnce(image: string) {
  const stream = await docker.pull(image, pullAuth(image));
  await new Promise<void>((resolve, reject) => {
    let lastReport = 0;
    let failure: string | null = null;
    docker.modem.followProgress(
      stream,
      (err) => (err ? reject(err) : failure ? reject(new Error(failure)) : resolve()),
      (event: { status?: string; progress?: string; id?: string; error?: string; errorDetail?: { message?: string } }) => {
        if (event.error || event.errorDetail?.message) {
          failure = event.errorDetail?.message ?? event.error ?? "unknown error";
          return;
        }
        if (Date.now() - lastReport < 3000 || !event.status) return;
        lastReport = Date.now();
        const line = `${event.status}${event.id ? ` ${event.id}` : ""} ${event.progress ?? ""}`.trim();
        for (const id of pullWatchers.get(image) ?? []) hub.system(id, line);
      },
    );
  });
  if (!(await hasImage(image))) throw new Error("the pull finished but the image is not on the node");
}

/** Pulls an image, sharing one download between concurrent callers (installs and background pre-pulls). */
export function pullImage(image: string, serverId?: string): Promise<void> {
  if (serverId) {
    const watchers = pullWatchers.get(image) ?? new Set<string>();
    watchers.add(serverId);
    pullWatchers.set(image, watchers);
    hub.system(serverId, `Pulling image ${image}…`);
  }
  const running = pulls.get(image);
  if (running) return running;
  const pull = (async () => {
    for (let attempt = 1; ; attempt++) {
      try {
        await pullOnce(image);
        break;
      } catch (err) {
        const message = (err as { json?: { message?: string } }).json?.message ?? (err instanceof Error ? err.message : String(err));
        if (attempt >= 3 || isPermanentPullError(message)) throw new HttpError(502, describePullError(image, message));
        for (const id of pullWatchers.get(image) ?? []) hub.system(id, `Download of ${image} failed (${message}), retrying…`);
        await new Promise((r) => setTimeout(r, attempt * 5000));
      }
    }
    for (const id of pullWatchers.get(image) ?? []) hub.system(id, `Image ${image} is ready`);
  })().finally(() => {
    pulls.delete(image);
    pullWatchers.delete(image);
  });
  pulls.set(image, pull);
  return pull;
}

/** Warnings about Docker setups that are known to break server containers (logged at agent start). */
export async function dockerEnvironmentWarnings(): Promise<string[]> {
  const info = await docker.info().catch(() => null);
  if (!info) return ["Cannot reach the Docker daemon. Is /var/run/docker.sock mounted into the agent?"];
  const warnings: string[] = [];
  if (String(info.DockerRootDir ?? "").includes("/snap/")) {
    warnings.push(
      "Docker is installed as a snap package. Snap Docker cannot bind-mount /var/lib/loadstone, so servers fail to install or start. Remove it (snap remove docker) and install Docker Engine with: curl -fsSL https://get.docker.com | sh",
    );
  }
  return warnings;
}

function describeContainerError(err: unknown): never {
  const message = (err as { json?: { message?: string } }).json?.message ?? (err instanceof Error ? err.message : String(err));
  if (/mount source path|read-only file system|bind source path does not exist/i.test(message)) {
    throw new HttpError(
      500,
      `Docker could not mount the server folder (${message}). If Docker is installed as a snap (common on Ubuntu), replace it with Docker Engine from get.docker.com.`,
    );
  }
  throw err;
}

/** UID:GID Minecraft containers run as; matches the agent's own unprivileged user so both can manage the files. */
const SERVER_USER = "1000:1000";
const isItzgImage = (image: string) => /^(docker\.io\/)?itzg\/(minecraft-server|mc-proxy)(:|@|$)/.test(image);

/** Shared bridge network for server containers, so proxies reach backends on the same node by container name. */
export const SERVER_NETWORK = "loadstone";

async function ensureNetwork() {
  const existing = await docker.listNetworks({ filters: { name: [SERVER_NETWORK] } });
  if (existing.some((n) => n.Name === SERVER_NETWORK)) return;
  await docker.createNetwork({ Name: SERVER_NETWORK, Driver: "bridge", Labels: { "io.loadstone.managed": "true" } }).catch((err: { statusCode?: number }) => {
    if (err.statusCode !== 409) throw err;
  });
}

/** Puts the agent itself on the server network (when it runs in a container) so it can reach servers over RCON. */
export async function joinAgentToServerNetwork() {
  try {
    const self = await docker.getContainer(os.hostname()).inspect();
    await ensureNetwork();
    if (!self.NetworkSettings.Networks?.[SERVER_NETWORK]) await docker.getNetwork(SERVER_NETWORK).connect({ Container: self.Id });
    return true;
  } catch {
    return false;
  }
}

/** Attaches an existing (possibly running) server container to the shared network; returns its hostname there. */
export async function joinServerNetwork(serverId: string) {
  const info = await inspect(serverId);
  if (!info) throw notFound("Server container");
  await ensureNetwork();
  if (!info.NetworkSettings.Networks?.[SERVER_NETWORK]) {
    await docker.getNetwork(SERVER_NETWORK).connect({ Container: info.Id }).catch((err: { statusCode?: number; message?: string }) => {
      if (!/already exists/i.test(err.message ?? "")) throw err;
    });
  }
  return { hostname: containerName(serverId) };
}

export async function ensureImage(image: string, serverId?: string) {
  if (!pulls.has(image) && (await hasImage(image))) return;
  await pullImage(image, serverId);
}

export async function createContainer(serverId: string, spec: ServerSpec) {
  await fs.mkdir(serverRoot(serverId), { recursive: true });
  await ensureImage(spec.image, serverId);
  const existing = await inspect(serverId);
  if (existing) {
    if (existing.State.Running) throw conflict("Server container is running");
    await docker.getContainer(existing.Id).remove({ force: true });
  }
  const overheadMb = Math.max(384, Math.round(spec.memoryMb * 0.2));
  const memoryBytes = (spec.memoryMb + overheadMb) * 1024 * 1024;
  const portKey = `${spec.internalPort}/tcp`;
  await ensureNetwork();
  const container = await docker
    .createContainer({
      name: containerName(serverId),
      Image: spec.image,
      ...(isItzgImage(spec.image) ? { User: SERVER_USER } : {}),
      Env: Object.entries({ ...spec.env, ...(isItzgImage(spec.image) && spec.commandMode === "rcon" ? { RCON_PASSWORD: rconPassword(serverId) } : {}) }).map(
        ([k, v]) => `${k}=${v}`,
      ),
      Labels: { [LABEL_SERVER]: serverId, [LABEL_SPEC]: specHash(spec), "io.loadstone.managed": "true" },
      OpenStdin: true,
      StdinOnce: false,
      Tty: false,
      AttachStdin: false,
      StopSignal: "SIGTERM",
      StopTimeout: 60,
      ExposedPorts: { [portKey]: {} },
      ...(spec.startupCommand ? { Entrypoint: ["/bin/sh", "-c"], Cmd: [spec.startupCommand] } : {}),
      HostConfig: {
        Binds: [`${hostServerRoot(serverId)}:${spec.dataPath}`],
        NetworkMode: SERVER_NETWORK,
        PortBindings: { [portKey]: [{ HostPort: String(spec.port) }] },
        Memory: memoryBytes,
        MemorySwap: memoryBytes,
        ...(spec.cpuPercent > 0 ? { NanoCpus: Math.round((spec.cpuPercent / 100) * 1e9) } : {}),
        PidsLimit: 8192,
        RestartPolicy: { Name: "unless-stopped" },
        SecurityOpt: ["no-new-privileges:true"],
        // Loadstone's itzg images run fine as an unprivileged user without capabilities; custom images keep defaults.
        ...(isItzgImage(spec.image) ? { CapDrop: ["ALL"] } : {}),
        LogConfig: { Type: "json-file", Config: { "max-size": "20m", "max-file": "3" } },
        Init: false,
      },
    })
    .catch(describeContainerError);
  await saveSpec(serverId, spec);
  return container.id;
}

async function ensureCurrent(serverId: string, spec?: ServerSpec) {
  const desired = spec ?? (await loadSpec(serverId));
  if (!desired) throw notFound("Server");
  if (spec) await saveSpec(serverId, spec);
  const info = await inspect(serverId);
  if (!info || info.Config.Labels?.[LABEL_SPEC] !== specHash(desired)) {
    if (info?.State.Running) return info.Id;
    hub.system(serverId, info ? "Configuration changed, recreating container…" : "Creating container…");
    return createContainer(serverId, desired);
  }
  return info.Id;
}

async function performPower(serverId: string, action: PowerAction, spec?: ServerSpec) {
  const name = containerName(serverId);
  switch (action) {
    case "start": {
      await ensureCurrent(serverId, spec);
      const info = await inspect(serverId);
      if (info?.State.Running) return;
      hub.system(serverId, "Starting server…");
      await repairOwnership(serverId);
      await docker.getContainer(name).start().catch(describeContainerError);
      return;
    }
    case "stop": {
      closeRcon(serverId);
      const info = await inspect(serverId);
      if (!info?.State.Running) return;
      stopping.add(serverId);
      hub.system(serverId, "Stopping server…");
      try {
        await docker.getContainer(name).stop({ t: 60 });
      } finally {
        stopping.delete(serverId);
      }
      hub.system(serverId, "Server stopped");
      return;
    }
    case "restart": {
      await performPower(serverId, "stop");
      await performPower(serverId, "start", spec);
      return;
    }
    case "kill": {
      closeRcon(serverId);
      const info = await inspect(serverId);
      if (!info?.State.Running) return;
      hub.system(serverId, "Killing server process");
      await docker.getContainer(name).kill();
      return;
    }
  }
}

const inflight = new Map<string, Promise<void>>();

export function power(serverId: string, action: PowerAction, spec?: ServerSpec) {
  if (inflight.has(serverId) && action !== "kill") throw conflict("Another power action is already in progress");
  const run = performPower(serverId, action, spec)
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      hub.system(serverId, `Power action "${action}" failed: ${message}`);
    })
    .finally(() => inflight.delete(serverId));
  inflight.set(serverId, run);
}

/** Reinstall: removes the container and every server file, but keeps the server's backups. */
export async function wipeServer(serverId: string) {
  closeRcon(serverId);
  const info = await inspect(serverId);
  if (info) await docker.getContainer(info.Id).remove({ force: true, v: true });
  await fs.rm(serverRoot(serverId), { recursive: true, force: true });
  await fs.rm(metaPath(serverId), { force: true });
  invalidateUsage(serverId);
}

export async function removeServer(serverId: string) {
  closeRcon(serverId);
  const info = await inspect(serverId);
  if (info) await docker.getContainer(info.Id).remove({ force: true, v: true });
  await fs.rm(serverRoot(serverId), { recursive: true, force: true });
  await fs.rm(path.join(config.dirs.backups, serverId), { recursive: true, force: true });
  await fs.rm(metaPath(serverId), { force: true });
}

export async function stats(serverId: string): Promise<ServerStats> {
  const info = await inspect(serverId);
  const state = runtimeState(info, serverId);
  const diskBytes = await serverUsage(serverId);
  const base: ServerStats = {
    state,
    cpuPercent: 0,
    memoryBytes: 0,
    memoryLimitBytes: info?.HostConfig.Memory ?? 0,
    networkRxBytes: 0,
    networkTxBytes: 0,
    startedAt: info?.State.Running ? info.State.StartedAt : null,
    diskBytes,
  };
  if (!info?.State.Running) return base;
  const s = (await docker.getContainer(info.Id).stats({ stream: false })) as unknown as Docker.ContainerStats;
  const cpuDelta = s.cpu_stats.cpu_usage.total_usage - s.precpu_stats.cpu_usage.total_usage;
  const sysDelta = (s.cpu_stats.system_cpu_usage ?? 0) - (s.precpu_stats.system_cpu_usage ?? 0);
  const cpus = s.cpu_stats.online_cpus || s.cpu_stats.cpu_usage.percpu_usage?.length || 1;
  const cache = (s.memory_stats.stats as Record<string, number> | undefined)?.inactive_file ?? 0;
  const nets = Object.values(s.networks ?? {});
  return {
    ...base,
    cpuPercent: sysDelta > 0 && cpuDelta > 0 ? (cpuDelta / sysDelta) * cpus * 100 : 0,
    memoryBytes: Math.max(0, (s.memory_stats.usage ?? 0) - cache),
    memoryLimitBytes: s.memory_stats.limit ?? base.memoryLimitBytes,
    networkRxBytes: nets.reduce((a, n) => a + n.rx_bytes, 0),
    networkTxBytes: nets.reduce((a, n) => a + n.tx_bytes, 0),
  };
}

function demuxBuffer(buf: Buffer): string {
  const out: Buffer[] = [];
  let i = 0;
  while (i + 8 <= buf.length) {
    const type = buf[i];
    const size = buf.readUInt32BE(i + 4);
    if (type !== 0 && type !== 1 && type !== 2) return buf.toString("utf8");
    out.push(buf.subarray(i + 8, i + 8 + size));
    i += 8 + size;
  }
  return Buffer.concat(out).toString("utf8");
}

export async function exec(serverId: string, cmd: string[], opts: { user?: string; timeoutMs?: number } = {}) {
  const container = docker.getContainer(containerName(serverId));
  const e = await container.exec({ Cmd: cmd, AttachStdout: true, AttachStderr: true, User: opts.user });
  const stream = await e.start({ hijack: true, stdin: false });
  const stdout = new PassThrough();
  const chunks: Buffer[] = [];
  stdout.on("data", (c: Buffer) => chunks.push(c));
  docker.modem.demuxStream(stream, stdout, stdout);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      stream.destroy();
      reject(new HttpError(504, "Command timed out"));
    }, opts.timeoutMs ?? 15_000);
    stream.on("end", () => {
      clearTimeout(timer);
      resolve();
    });
    stream.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
  const result = await e.inspect();
  return { exitCode: result.ExitCode ?? 0, output: Buffer.concat(chunks).toString("utf8").trim() };
}

const stdinStreams = new Map<string, NodeJS.ReadWriteStream>();

async function writeStdin(serverId: string, line: string) {
  let stream = stdinStreams.get(serverId);
  if (!stream) {
    stream = (await docker.getContainer(containerName(serverId)).attach({ stream: true, stdin: true, stdout: false, stderr: false, hijack: true })) as NodeJS.ReadWriteStream;
    const s = stream;
    const drop = () => stdinStreams.get(serverId) === s && stdinStreams.delete(serverId);
    s.on("end", drop);
    s.on("close", drop);
    s.on("error", drop);
    stdinStreams.set(serverId, s);
  }
  stream.write(`${line}\n`);
}

const rconWarnedAt = new Map<string, number>();

/** Logs (at most every 10 minutes per server) why the persistent RCON connection couldn't be used. */
function warnRconFallback(serverId: string, err: unknown) {
  const last = rconWarnedAt.get(serverId) ?? 0;
  if (Date.now() - last < 10 * 60_000) return;
  rconWarnedAt.set(serverId, Date.now());
  const reason = err instanceof Error ? err.message : String(err);
  console.warn(
    `[rcon] persistent connection to ${containerName(serverId)} failed (${reason}); using rcon-cli, which logs "RCON Client" lines. ` +
      "Restart the server once so its container is recreated, and make sure the agent runs in Docker on the same host.",
  );
}

export async function sendCommand(serverId: string, command: string, quiet = false): Promise<string | null> {
  const info = await inspect(serverId);
  if (!info?.State.Running) throw conflict("Server is not running");
  const spec = await loadSpec(serverId);
  if (!quiet) hub.publish(serverId, [`> ${command}`]);
  if (spec?.commandMode === "rcon") {
    // Typed console commands go through the console pipe: no RCON connection (and no "RCON Client" log lines),
    // and the server prints the command's output to its log, which the console already streams.
    if (!quiet) {
      const piped = await exec(serverId, ["mc-send-to-console", command], { user: SERVER_USER.split(":")[0] }).catch(() => null);
      if (piped && piped.exitCode === 0) return null;
    }
    try {
      // Background queries (e.g. the player list) need the reply: one persistent RCON connection per server.
      const host = info.NetworkSettings.Networks?.[SERVER_NETWORK]?.IPAddress || containerName(serverId);
      const output = (await rconCommand(serverId, host, command)).trimEnd();
      if (!quiet && output) hub.publish(serverId, output.split(/\r?\n/));
      return output;
    } catch (err) {
      warnRconFallback(serverId, err);
    }
    try {
      const res = await exec(serverId, ["rcon-cli", command]);
      if (res.exitCode === 0) {
        if (!quiet && res.output) hub.publish(serverId, res.output.split(/\r?\n/));
        return res.output;
      }
    } catch {
      /* fall back to console pipe below */
    }
    const piped = await exec(serverId, ["mc-send-to-console", command], { user: "1000" }).catch(() => null);
    if (piped && piped.exitCode === 0) return null;
  }
  await writeStdin(serverId, command);
  return null;
}

export async function logs(serverId: string, lines: number): Promise<string> {
  const info = await inspect(serverId);
  if (!info) return "";
  const buf = (await docker.getContainer(info.Id).logs({ stdout: true, stderr: true, tail: lines, follow: false })) as unknown as Buffer;
  return demuxBuffer(Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf)));
}

export async function followLogs(serverId: string, opts: { tail?: number; since?: number }): Promise<Readable | null> {
  const info = await inspect(serverId);
  if (!info) return null;
  const raw = (await docker.getContainer(info.Id).logs({
    stdout: true,
    stderr: true,
    follow: true,
    tail: opts.tail,
    since: opts.since,
  })) as unknown as Readable;
  const out = new PassThrough();
  docker.modem.demuxStream(raw, out, out);
  raw.on("end", () => out.end());
  raw.on("error", (err) => out.destroy(err));
  out.on("close", () => raw.destroy());
  return out;
}

export async function dockerSummary() {
  try {
    const [version, info] = await Promise.all([docker.version(), docker.info() as Promise<{ Containers: number; ContainersRunning: number }>]);
    return { version: version.Version, containers: info.Containers, running: info.ContainersRunning };
  } catch {
    return null;
  }
}
