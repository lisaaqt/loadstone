import type { Node } from "@/generated/prisma/client";
import { decrypt } from "./crypto";

export class AgentError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type NodeConnection = Pick<Node, "id" | "scheme" | "host" | "port" | "tokenEncrypted">;

interface RequestOptions {
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  json?: unknown;
  body?: BodyInit | ReadableStream<Uint8Array> | null;
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export class AgentClient {
  private readonly token: string;

  constructor(private readonly node: NodeConnection) {
    this.token = decrypt(node.tokenEncrypted);
  }

  get baseUrl() {
    return `${this.node.scheme}://${this.node.host}:${this.node.port}`;
  }

  get wsUrl() {
    return `${this.node.scheme === "https" ? "wss" : "ws"}://${this.node.host}:${this.node.port}`;
  }

  get authHeader() {
    return `Bearer ${this.token}`;
  }

  url(path: string, query?: RequestOptions["query"]) {
    const url = new URL(path, this.baseUrl);
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    return url;
  }

  async raw(path: string, opts: RequestOptions = {}): Promise<Response> {
    const headers: Record<string, string> = { authorization: this.authHeader, ...opts.headers };
    let body: RequestOptions["body"] = opts.body ?? null;
    if (opts.json !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(opts.json);
    }
    const timeout = AbortSignal.timeout(opts.timeoutMs ?? 30_000);
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
    let res: Response;
    try {
      res = await fetch(this.url(path, opts.query), {
        method: opts.method ?? "GET",
        headers,
        body: body as BodyInit | null,
        signal,
        ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
      } as RequestInit);
    } catch (err) {
      const reason = err instanceof Error ? (err.name === "TimeoutError" ? "timed out" : err.message) : "unknown error";
      throw new AgentError(503, `Node is unreachable (${reason})`);
    }
    if (!res.ok) {
      let message = `Node responded with ${res.status}`;
      try {
        const data = (await res.json()) as { error?: string };
        if (data.error) message = data.error;
      } catch {
        /* non-JSON error body */
      }
      throw new AgentError(res.status, message);
    }
    return res;
  }

  async request<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
    const res = await this.raw(path, opts);
    if (res.status === 204) return undefined as T;
    const type = res.headers.get("content-type") ?? "";
    return (type.includes("application/json") ? await res.json() : await res.text()) as T;
  }
}

export function agentFor(node: NodeConnection) {
  return new AgentClient(node);
}
