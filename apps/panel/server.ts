import { createServer, type IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import next from "next";
import { loadEnvConfig } from "@next/env";
import { WebSocket, WebSocketServer } from "ws";
import { commandSchema } from "@loadstone/shared";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { serverScope } from "@/lib/access";
import { agentFor } from "@/lib/agent-client";
import { logActivity } from "@/lib/activity";
import { isSameOriginRequest } from "@/lib/api";
import { parseCookieHeader, SESSION_COOKIE, validateSessionToken, type AuthUser } from "@/lib/session";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
const config = env();
const dev = config.NODE_ENV !== "production";
const app = next({ dev, hostname: config.HOST, port: config.PORT });
const handle = app.getRequestHandler();

const CONSOLE_PATH = /^\/ws\/servers\/([a-z0-9]{8,40})\/console$/;
const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

function reject(socket: Duplex, status: number, message: string) {
  socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

function originAllowed(req: IncomingMessage) {
  if (!req.headers.origin && !req.headers["sec-fetch-site"]) return false;
  return isSameOriginRequest({
    get: (name) => {
      const v = req.headers[name.toLowerCase()];
      return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
    },
  });
}

function remoteAddress(req: IncomingMessage) {
  if (config.TRUST_PROXY) {
    const fwd = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
    if (fwd) return fwd;
  }
  return req.socket.remoteAddress ?? "unknown";
}

async function bridgeConsole(client: WebSocket, user: AuthUser, serverId: string, ip: string) {
  const server = await db.server.findFirst({ where: { id: serverId, ...serverScope(user) }, include: { node: true } });
  if (!server) {
    client.close(4404, "Server not found");
    return;
  }
  const agent = agentFor(server.node);
  const upstream = new WebSocket(`${agent.wsUrl}/api/servers/${server.id}/console`, {
    headers: { authorization: agent.authHeader },
    handshakeTimeout: 10_000,
    maxPayload: 4 * 1024 * 1024,
  });

  const sendError = (message: string) => {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: "error", message }));
  };

  let tokens = 10;
  const refill = setInterval(() => (tokens = Math.min(10, tokens + 2)), 1000);
  const ping = setInterval(() => {
    if (client.readyState === WebSocket.OPEN) client.ping();
  }, 30_000);

  const cleanup = () => {
    clearInterval(refill);
    clearInterval(ping);
    if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) upstream.terminate();
    if (client.readyState === WebSocket.OPEN) client.close();
  };

  upstream.on("message", (data) => {
    if (client.readyState === WebSocket.OPEN) client.send(data.toString());
  });
  upstream.on("error", (err) => sendError(`Node connection error: ${err.message}`));
  upstream.on("close", () => {
    sendError("Lost connection to the node");
    cleanup();
  });

  client.on("message", (raw) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const msg = parsed as { type?: string; command?: unknown };
    if (msg.type !== "command") return;
    const result = commandSchema.safeParse({ command: msg.command });
    if (!result.success) return sendError(result.error.issues[0]?.message ?? "Invalid command");
    if (tokens <= 0) return sendError("You are sending commands too quickly");
    tokens--;
    if (upstream.readyState !== WebSocket.OPEN) return sendError("Not connected to the node yet");
    upstream.send(JSON.stringify({ type: "command", command: result.data.command }));
    void logActivity({
      action: "server.command",
      message: `Ran "${result.data.command}" on ${server.name}`,
      userId: user.id,
      serverId: server.id,
      ip,
    });
  });
  client.on("close", cleanup);
  client.on("error", cleanup);
}

void app.prepare().then(() => {
  const nextUpgrade = app.getUpgradeHandler();

  const httpServer = createServer((req, res) => {
    req.headers["x-loadstone-remote-addr"] = req.socket.remoteAddress ?? "unknown";
    void handle(req, res);
  });

  httpServer.on("upgrade", (req, socket, head) => {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    const match = pathname.match(CONSOLE_PATH);
    if (!match) {
      if (pathname.startsWith("/_next/")) return void nextUpgrade(req, socket, head);
      return reject(socket, 404, "Not Found");
    }
    if (!originAllowed(req)) return reject(socket, 403, "Forbidden");
    void (async () => {
      const auth = await validateSessionToken(parseCookieHeader(req.headers.cookie, SESSION_COOKIE)).catch(() => null);
      if (!auth) return reject(socket, 401, "Unauthorized");
      wss.handleUpgrade(req, socket, head, (ws) => {
        bridgeConsole(ws, auth.user, match[1]!, remoteAddress(req)).catch((err: unknown) => {
          console.error("[ws] console bridge failed", err);
          ws.close(1011, "Internal error");
        });
      });
    })();
  });

  httpServer.listen(config.PORT, config.HOST, () => {
    console.log(`[loadstone] panel ready on http://${config.HOST}:${config.PORT} (${dev ? "development" : "production"})`);
  });

  const shutdown = () => {
    console.log("[loadstone] shutting down");
    wss.clients.forEach((c) => c.close(1001, "Server shutting down"));
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
});
