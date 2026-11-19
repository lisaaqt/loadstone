import type { Readable } from "node:stream";
import type { WebSocket } from "ws";
import { commandSchema, type ConsoleServerMessage, type ServerRuntimeState } from "@loadstone/shared";
import { followLogs, getState, sendCommand } from "./docker.js";
import { hub } from "./hub.js";

const MAX_LINE = 8192;

export function attachConsole(socket: WebSocket, serverId: string) {
  let closed = false;
  let logStream: Readable | null = null;
  let state: ServerRuntimeState | null = null;
  let since: number | undefined;
  let partial = "";
  let pending: string[] = [];

  const send = (msg: ConsoleServerMessage) => {
    if (!closed && socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
  };

  const flush = setInterval(() => {
    if (pending.length) {
      send({ type: "log", lines: pending });
      pending = [];
    }
  }, 60);

  const push = (lines: string[]) => {
    for (const l of lines) pending.push(l.length > MAX_LINE ? `${l.slice(0, MAX_LINE)}…` : l);
    if (pending.length > 2000) pending = pending.slice(-2000);
  };

  const unsubscribe = hub.subscribe(serverId, push);

  async function openLogs() {
    if (closed || logStream) return;
    const stream = await followLogs(serverId, since === undefined ? { tail: 500 } : { since }).catch(() => null);
    if (!stream) return;
    if (closed) return void stream.destroy();
    logStream = stream;
    stream.setEncoding("utf8");
    stream.on("data", (chunk: string) => {
      const parts = (partial + chunk).split(/\r?\n/);
      partial = parts.pop() ?? "";
      push(parts);
    });
    const done = () => {
      if (partial) push([partial]);
      partial = "";
      if (logStream === stream) logStream = null;
      since = Math.floor(Date.now() / 1000);
    };
    stream.on("end", done);
    stream.on("error", done);
    stream.on("close", done);
  }

  async function poll() {
    if (closed) return;
    const next = await getState(serverId).catch(() => null);
    if (next && next !== state) {
      state = next;
      send({ type: "status", state: next });
    }
    if (next && next !== "missing" && !logStream) await openLogs();
  }

  void poll();
  const interval = setInterval(() => void poll(), 2000);

  socket.on("message", (raw) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const msg = parsed as { type?: string; command?: unknown };
    if (msg.type !== "command") return;
    const result = commandSchema.safeParse({ command: msg.command });
    if (!result.success) return send({ type: "error", message: "Invalid command" });
    sendCommand(serverId, result.data.command).catch((err: unknown) => send({ type: "error", message: err instanceof Error ? err.message : "Command failed" }));
  });

  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(interval);
    clearInterval(flush);
    unsubscribe();
    logStream?.destroy();
  };
  socket.on("close", close);
  socket.on("error", close);
}
