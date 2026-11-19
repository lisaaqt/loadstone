import { commandSchema } from "@loadstone/shared";
import { handler, parseBody } from "@/lib/api";
import { serverWithAgent } from "@/lib/access";
import { logActivity } from "@/lib/activity";

type Params = { id: string };

export const POST = handler<Params>(async ({ req, user, params, ip }) => {
  const { command } = await parseBody(req, commandSchema);
  const { server, agent, base } = await serverWithAgent(user, params.id);
  const result = await agent.request<{ output?: string }>(`${base}/command`, { method: "POST", json: { command } });
  await logActivity({ action: "server.command", message: `Ran "${command}" on ${server.name}`, userId: user.id, serverId: server.id, ip });
  return { output: result?.output ?? null };
});
