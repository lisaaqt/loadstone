import type { AgentClient } from "./agent-client";
import { ApiError } from "./api";

export interface PlayerRef {
  uuid: string;
  name: string;
}

export interface OpEntry extends PlayerRef {
  level: number;
  bypassesPlayerLimit: boolean;
}

export interface BanEntry extends PlayerRef {
  created: string;
  source: string;
  expires: string;
  reason: string;
}

export interface KnownPlayer extends PlayerRef {
  expiresOn?: string;
}

export async function readJsonFile<T>(agent: AgentClient, base: string, path: string, fallback: T): Promise<T> {
  try {
    const { content } = await agent.request<{ content: string }>(`${base}/files/content`, { query: { path } });
    const parsed = JSON.parse(content) as unknown;
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonFile(agent: AgentClient, base: string, path: string, value: unknown) {
  await agent.request(`${base}/files/write`, { method: "POST", json: { path, content: `${JSON.stringify(value, null, 2)}\n` } });
}

export function parseListOutput(output: string): { online: number; max: number; players: string[] } | null {
  const clean = output.replace(/§./g, "");
  const match = clean.match(/There are (\d+)\s*(?:of a max of|\/|out of maximum)\s*(\d+) players online[.:]?\s*(.*)$/is);
  if (!match) return null;
  const players = (match[3] ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter((p) => /^[A-Za-z0-9_]{1,16}$/.test(p));
  return { online: Number(match[1]), max: Number(match[2]), players };
}

function dashUuid(id: string) {
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

export async function resolvePlayer(name: string): Promise<PlayerRef> {
  let res: Response;
  try {
    res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`, {
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new ApiError(502, "Could not reach Mojang to resolve the player's UUID");
  }
  if (res.status === 404 || res.status === 204) throw new ApiError(404, `No Minecraft account named ${name}`);
  if (!res.ok) throw new ApiError(502, `Mojang responded with ${res.status}`);
  const data = (await res.json()) as { id: string; name: string };
  return { uuid: dashUuid(data.id), name: data.name };
}

export function mcTimestamp(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} +0000`;
}
