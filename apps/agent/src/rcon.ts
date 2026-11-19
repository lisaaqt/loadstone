import { createHmac } from "node:crypto";
import net from "node:net";
import { config } from "./config.js";

/**
 * Persistent RCON connections, one per server. Minecraft logs "Thread RCON Client … started / shutting down" for every
 * connection, so reusing one connection instead of running rcon-cli per command keeps the console clean.
 */

const RCON_PORT = 25575;
const TYPE_AUTH = 3;
const TYPE_COMMAND = 2;
const END_MARKER_TYPE = 200;

/** Per-server RCON password derived from the agent token, so the agent never has to read it from the server files. */
export const rconPassword = (serverId: string) => createHmac("sha256", config.token).update(`rcon:${serverId}`).digest("hex").slice(0, 32);

function encode(id: number, type: number, body: string) {
  const payload = Buffer.from(body, "utf8");
  const packet = Buffer.alloc(14 + payload.length);
  packet.writeInt32LE(10 + payload.length, 0);
  packet.writeInt32LE(id, 4);
  packet.writeInt32LE(type, 8);
  payload.copy(packet, 12);
  return packet;
}

class RconClient {
  private socket: net.Socket;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private waiting = new Map<number, (body: string) => void>();
  private chain: Promise<unknown> = Promise.resolve();
  closed = false;

  private constructor(socket: net.Socket) {
    this.socket = socket;
    socket.on("data", (chunk) => this.onData(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    socket.on("close", () => this.close());
    socket.on("error", () => this.close());
  }

  static async connect(host: string, password: string): Promise<RconClient> {
    const socket = await new Promise<net.Socket>((resolve, reject) => {
      const s = net.connect({ host, port: RCON_PORT });
      const timer = setTimeout(() => s.destroy(new Error("RCON connect timeout")), 3000);
      s.once("connect", () => (clearTimeout(timer), resolve(s)));
      s.once("error", (err) => (clearTimeout(timer), reject(err)));
    });
    socket.setKeepAlive(true, 30_000);
    const client = new RconClient(socket);
    const id = client.nextId++;
    const authed = await Promise.race([
      new Promise<boolean>((resolve) => {
        client.waiting.set(id, () => resolve(true));
        client.waiting.set(-1, () => resolve(false));
        socket.write(encode(id, TYPE_AUTH, password));
      }),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3000)),
    ]);
    client.waiting.clear();
    if (!authed) {
      client.close();
      throw new Error("RCON authentication failed");
    }
    return client;
  }

  private onData(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) {
      const length = this.buffer.readInt32LE(0);
      if (this.buffer.length < length + 4) return;
      const id = this.buffer.readInt32LE(4);
      const body = this.buffer.toString("utf8", 12, 4 + length - 2);
      this.buffer = this.buffer.subarray(length + 4);
      this.waiting.get(id)?.(body);
    }
  }

  /** Sends a command; responses longer than one packet are collected until the end-marker packet comes back. */
  command(command: string, timeoutMs = 8000): Promise<string> {
    const run = () =>
      new Promise<string>((resolve, reject) => {
        if (this.closed) return reject(new Error("RCON connection closed"));
        const id = this.nextId++;
        const marker = this.nextId++;
        const parts: string[] = [];
        const done = (err?: Error) => {
          clearTimeout(timer);
          this.waiting.delete(id);
          this.waiting.delete(marker);
          if (err) reject(err);
          else resolve(parts.join(""));
        };
        const timer = setTimeout(() => (parts.length ? done() : done(new Error("RCON command timed out"))), timeoutMs);
        this.waiting.set(id, (body) => parts.push(body));
        this.waiting.set(marker, () => done());
        this.socket.write(encode(id, TYPE_COMMAND, command));
        this.socket.write(encode(marker, END_MARKER_TYPE, ""));
      });
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => undefined);
    return next;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    for (const resolve of this.waiting.values()) resolve("");
    this.waiting.clear();
    this.socket.destroy();
  }
}

const clients = new Map<string, Promise<RconClient>>();

export async function rconCommand(serverId: string, host: string, command: string) {
  let pending = clients.get(serverId);
  if (pending) {
    const existing = await pending.catch(() => null);
    if (!existing || existing.closed) pending = undefined;
  }
  if (!pending) {
    pending = RconClient.connect(host, rconPassword(serverId));
    clients.set(serverId, pending);
    pending.catch(() => clients.delete(serverId));
  }
  const client = await pending;
  try {
    return await client.command(command);
  } catch (err) {
    client.close();
    clients.delete(serverId);
    throw err;
  }
}

export function closeRcon(serverId: string) {
  const pending = clients.get(serverId);
  clients.delete(serverId);
  void pending?.then((c) => c.close()).catch(() => undefined);
}
