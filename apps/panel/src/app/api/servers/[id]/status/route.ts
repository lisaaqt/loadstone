import type { ServerStats } from "@loadstone/shared";
import { db } from "@/lib/db";
import { handler } from "@/lib/api";
import { serverWithAgent } from "@/lib/access";
import { runtimeToState } from "@/components/servers/state";

type Params = { id: string };

export const GET = handler<Params>(async ({ user, params }) => {
  const { server, agent, base } = await serverWithAgent(user, params.id);
  if (server.state === "INSTALLING" || server.state === "RESTORING" || server.state === "ERROR") return { state: server.state, stats: null, error: server.installError };
  try {
    const stats = await agent.request<ServerStats>(`${base}/stats`, { timeoutMs: 8000 });
    const state = runtimeToState(stats.state);
    if (state !== server.state) await db.server.update({ where: { id: server.id }, data: { state, stateChangedAt: new Date() } });
    return { state, stats, error: null };
  } catch (err) {
    return { state: server.state, stats: null, error: err instanceof Error ? err.message : "Node unreachable" };
  }
});
