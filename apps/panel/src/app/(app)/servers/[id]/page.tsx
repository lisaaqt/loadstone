import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getServerForUser } from "@/lib/access";
import { ServerOverview } from "@/components/servers/server-overview";
import { ActivityList } from "@/components/activity/activity-list";
import { Card, CardHeader } from "@/components/ui/card";

export default async function ServerOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const server = await getServerForUser(user, id);
  const [activity, lastBackup, backupCount] = await Promise.all([
    db.activity.findMany({
      where: { serverId: server.id },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { user: { select: { id: true, name: true } }, server: { select: { id: true, name: true } } },
    }),
    db.backup.findFirst({ where: { serverId: server.id, status: "COMPLETED" }, orderBy: { completedAt: "desc" } }),
    db.backup.count({ where: { serverId: server.id, status: "COMPLETED" } }),
  ]);
  return (
    <div className="flex flex-col gap-3">
      <ServerOverview lastBackupAt={lastBackup?.completedAt?.toISOString() ?? null} backupCount={backupCount} />
      <Card>
        <CardHeader title="Recent activity" />
        <ActivityList items={activity} showServer={false} />
      </Card>
    </div>
  );
}
