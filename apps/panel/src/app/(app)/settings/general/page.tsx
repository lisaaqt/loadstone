import { requireAdmin } from "@/lib/auth";
import { getGeneralSettings } from "@/lib/settings";
import { GeneralSettingsForm } from "@/components/settings/general-form";

export const dynamic = "force-dynamic";

export default async function GeneralSettingsPage() {
  await requireAdmin();
  return <GeneralSettingsForm initial={await getGeneralSettings()} />;
}
