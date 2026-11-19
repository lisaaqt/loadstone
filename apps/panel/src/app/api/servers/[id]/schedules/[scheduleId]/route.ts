import { db } from "@/lib/db";
import { handler, notFound, parseBody } from "@/lib/api";
import { getServerForUser } from "@/lib/access";
import { enqueue, removeSchedule, syncSchedule } from "@/lib/queue";
import { logActivity } from "@/lib/activity";
import { scheduleInputSchema } from "@/lib/schedules";
import type { AuthUser } from "@/lib/session";

type Params = { id: string; scheduleId: string };

async function load(user: AuthUser, params: Params) {
  const server = await getServerForUser(user, params.id);
  const schedule = await db.schedule.findFirst({ where: { id: params.scheduleId, serverId: server.id } });
  if (!schedule) throw notFound("Schedule");
  return { server, schedule };
}

export const PUT = handler<Params>(async ({ req, user, params, ip }) => {
  const { server, schedule } = await load(user, params);
  const input = await parseBody(req, scheduleInputSchema);
  const updated = await db.schedule.update({ where: { id: schedule.id }, data: { ...input, payload: input.payload || null } });
  await syncSchedule(updated);
  await logActivity({ action: "schedule.update", message: `Updated schedule "${updated.name}" on ${server.name}`, userId: user.id, serverId: server.id, ip });
  return { schedule: updated };
});

export const POST = handler<Params>(async ({ user, params, ip }) => {
  const { server, schedule } = await load(user, params);
  await enqueue("schedule.run", { scheduleId: schedule.id });
  await logActivity({ action: "schedule.run", message: `Manually triggered schedule "${schedule.name}" on ${server.name}`, userId: user.id, serverId: server.id, ip });
  return Response.json({ ok: true }, { status: 202 });
});

export const DELETE = handler<Params>(async ({ user, params, ip }) => {
  const { server, schedule } = await load(user, params);
  await removeSchedule(schedule.id);
  await db.schedule.delete({ where: { id: schedule.id } });
  await logActivity({ action: "schedule.delete", message: `Deleted schedule "${schedule.name}" on ${server.name}`, userId: user.id, serverId: server.id, ip });
});
