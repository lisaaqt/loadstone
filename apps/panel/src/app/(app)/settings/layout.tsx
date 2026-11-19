import { requireUser } from "@/lib/auth";
import { PageContainer } from "@/components/shell/page";
import { PageHeader } from "@/components/ui/layout";
import { SettingsNav } from "@/components/settings/settings-nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <PageContainer>
      <PageHeader title="Settings" description="Manage your account and panel configuration." />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[180px_1fr]">
        <SettingsNav admin={user.role === "ADMIN"} />
        <div className="min-w-0">{children}</div>
      </div>
    </PageContainer>
  );
}
