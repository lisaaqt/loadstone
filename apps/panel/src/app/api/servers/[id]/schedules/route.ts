import { db } from "@/lib/db";
import { handler, parseBody } from "@/lib/api";
import { getServerForUser } from "@/lib/access";
import { syncSchedule } from "@/lib/queue";
import { logActivity } from "@/lib/activity";
import { describeCron, nextRuns, scheduleInputSchema } from "@/lib/schedules";

type Params = { id: string };

export const GET = handler<Params>(async ({ user, params }) => {
  const server = await getServerForUser(user, params.id);
  const schedules = await db.schedule.findMany({ where: { serverId: server.id }, orderBy: { createdAt: "asc" } });
  return {
    schedules: schedules.map((s) => ({ ...s, description: describeCron(s.cron), nextRuns: s.enabled ? nextRuns(s.cron, s.timezone) : [] })),
  };
});

export const POST = handler<Params>(async ({ req, user, params, ip }) => {
  const server = await getServerForUser(user, params.id);
  const input = await parseBody(req, scheduleInputSchema);
  const schedule = await db.schedule.create({ data: { ...input, payload: input.payload || null, serverId: server.id } });
  await syncSchedule(schedule);
  await logActivity({ action: "schedule.create", message: `Created schedule "${schedule.name}" on ${server.name}`, userId: user.id, serverId: server.id, ip });
  return Response.json({ schedule }, { status: 201 });
});
