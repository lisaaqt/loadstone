import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { PageContainer } from "@/components/shell/page";
import { PageHeader } from "@/components/ui/layout";
import { ActivityFeed } from "@/components/activity/activity-feed";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage() {
  const user = await requireUser();
  return (
    <PageContainer>
      <PageHeader title="Activity" description={user.role === "ADMIN" ? "Audit log of every action taken across the panel." : "Actions on your account and servers."} />
      <ActivityFeed />
    </PageContainer>
  );
}
