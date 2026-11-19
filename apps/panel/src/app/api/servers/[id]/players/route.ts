import { z } from "zod";
import { isProxySoftware } from "@loadstone/shared";
import { ApiError, handler, parseBody } from "@/lib/api";
import { serverWithAgent } from "@/lib/access";
import { logActivity } from "@/lib/activity";
import { minecraftNameSchema } from "@/lib/validation";
import { parseProperties, updateProperties } from "@/lib/properties";
import {
  mcTimestamp,
  parseListOutput,
  readJsonFile,
  resolvePlayer,
  writeJsonFile,
  type BanEntry,
  type KnownPlayer,
  type OpEntry,
  type PlayerRef,
} from "@/lib/players";

type Params = { id: string };

export const GET = handler<Params>(async ({ user, params }) => {
  const { server, agent, base } = await serverWithAgent(user, params.id);
  const [whitelist, ops, banned, known, properties] = await Promise.all([
    readJsonFile<PlayerRef[]>(agent, base, "/whitelist.json", []),
    readJsonFile<OpEntry[]>(agent, base, "/ops.json", []),
    readJsonFile<BanEntry[]>(agent, base, "/banned-players.json", []),
    readJsonFile<KnownPlayer[]>(agent, base, "/usercache.json", []),
    agent
      .request<{ content: string }>(`${base}/files/content`, { query: { path: "/server.properties" } })
      .then((r) => parseProperties(r.content))
      .catch(() => ({}) as Record<string, string>),
  ]);

  let online: ReturnType<typeof parseListOutput> = null;
  if (server.state === "RUNNING" && !isProxySoftware(server.software)) {
    try {
      const { output } = await agent.request<{ output?: string }>(`${base}/command`, { method: "POST", json: { command: "list", quiet: true }, timeoutMs: 8000 });
      online = output ? parseListOutput(output) : null;
    } catch {
      online = null;
    }
  }

  return {
    running: server.state === "RUNNING",
    online,
    whitelistEnabled: properties["white-list"] === "true",
    whitelist,
    ops,
    banned,
    known: known.sort((a, b) => (b.expiresOn ?? "").localeCompare(a.expiresOn ?? "")),
  };
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["whitelist-add", "whitelist-remove", "op", "deop", "pardon"]), player: minecraftNameSchema }),
  z.object({
    action: z.enum(["ban", "kick"]),
    player: minecraftNameSchema,
    reason: z.string().trim().max(200).regex(/^[^\r\n\0]*$/).optional(),
  }),
  z.object({ action: z.literal("whitelist-toggle"), enabled: z.boolean() }),
]);

export const POST = handler<Params>(async ({ req, user, params, ip }) => {
  const { server, agent, base } = await serverWithAgent(user, params.id);
  const input = await parseBody(req, actionSchema);
  const running = server.state === "RUNNING";

  const send = (command: string) => agent.request(`${base}/command`, { method: "POST", json: { command } });

  if (input.action === "whitelist-toggle") {
    if (running) await send(`whitelist ${input.enabled ? "on" : "off"}`);
    const { content } = await agent
      .request<{ content: string }>(`${base}/files/content`, { query: { path: "/server.properties" } })
      .catch(() => ({ content: "" }));
    await agent.request(`${base}/files/write`, {
      method: "POST",
      json: { path: "/server.properties", content: updateProperties(content, { "white-list": String(input.enabled), "enforce-whitelist": String(input.enabled) }) },
    });
  } else if (running) {
    const reason = "reason" in input && input.reason ? ` ${input.reason}` : "";
    const commands: Record<typeof input.action, string> = {
      "whitelist-add": `whitelist add ${input.player}`,
      "whitelist-remove": `whitelist remove ${input.player}`,
      op: `op ${input.player}`,
      deop: `deop ${input.player}`,
      ban: `ban ${input.player}${reason}`,
      pardon: `pardon ${input.player}`,
      kick: `kick ${input.player}${reason}`,
    };
    await send(commands[input.action]);
  } else {
    if (input.action === "kick") throw new ApiError(409, "The server must be running to kick players");
    const lower = input.player.toLowerCase();
    const drop = <T extends PlayerRef>(list: T[]) => list.filter((p) => p.name.toLowerCase() !== lower);
    const file = { "whitelist-add": "whitelist", "whitelist-remove": "whitelist", op: "ops", deop: "ops", ban: "banned-players", pardon: "banned-players" }[input.action];
    const path = `/${file}.json`;
    const list = await readJsonFile<PlayerRef[]>(agent, base, path, []);
    let next: unknown[];
    if (input.action === "whitelist-remove" || input.action === "deop" || input.action === "pardon") {
      next = drop(list);
    } else {
      const ref = await resolvePlayer(input.player);
      const rest = drop(list);
      if (input.action === "whitelist-add") next = [...rest, ref];
      else if (input.action === "op") next = [...rest, { ...ref, level: 4, bypassesPlayerLimit: false }];
      else
        next = [
          ...rest,
          { ...ref, created: mcTimestamp(), source: `Loadstone (${user.name})`, expires: "forever", reason: ("reason" in input && input.reason) || "Banned by an operator." },
        ];
    }
    await writeJsonFile(agent, base, path, next);
  }

  const subject = "player" in input ? input.player : input.enabled ? "on" : "off";
  await logActivity({ action: `players.${input.action}`, message: `${input.action.replace("-", " ")} ${subject} on ${server.name}`, userId: user.id, serverId: server.id, ip });
  return { ok: true, applied: running ? "live" : "file" };
});
