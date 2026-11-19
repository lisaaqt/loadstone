import { powerActionSchema } from "@loadstone/shared";
import { db } from "@/lib/db";
import { ApiError, handler, parseBody } from "@/lib/api";
import { serverWithAgent } from "@/lib/access";
import { specFor } from "@/lib/server-spec";
import { logActivity } from "@/lib/activity";

type Params = { id: string };

export const POST = handler<Params>(async ({ req, user, params, ip }) => {
  const { action } = await parseBody(req, powerActionSchema);
  const { server, agent, base } = await serverWithAgent(user, params.id);
  if (server.state === "INSTALLING") throw new ApiError(409, "The server is still being installed");
  if (server.state === "RESTORING") throw new ApiError(409, "A backup is being restored");

  await agent.request(`${base}/power`, {
    method: "POST",
    json: { action, spec: action === "start" || action === "restart" ? specFor(server) : undefined },
  });

  const state = action === "start" || action === "restart" ? "STARTING" : action === "kill" ? "OFFLINE" : "STOPPING";
  await db.server.update({ where: { id: server.id }, data: { state, stateChangedAt: new Date(), installError: null } });
  await logActivity({ action: `server.power.${action}`, message: `${action[0]!.toUpperCase()}${action.slice(1)} requested for ${server.name}`, userId: user.id, serverId: server.id, ip });
  return { ok: true, state };
});
