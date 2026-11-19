"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import type { GeneralSettings } from "@/lib/settings";
import { api, errorMessage } from "@/lib/client";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, InputGroup } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function GeneralSettingsForm({ initial }: { initial: GeneralSettings }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api("/api/settings", { method: "PUT", body: { general: form } });
      toast.success("Settings saved");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title="General" description="Panel-wide defaults." />
      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
        <Field label="Panel name" htmlFor="panel-name" hint="Shown in the sidebar.">
          <Input id="panel-name" value={form.panelName} onChange={(e) => setForm({ ...form, panelName: e.target.value })} maxLength={64} />
        </Field>
        <Field label="Default backup storage">
          <Select
            value={form.defaultBackupStorage}
            onValueChange={(v) => setForm({ ...form, defaultBackupStorage: v as "LOCAL" | "S3" | "SFTP" })}
            options={[
              { value: "LOCAL", label: "Local (node disk)" },
              { value: "S3", label: "S3-compatible" },
              { value: "SFTP", label: "SFTP server" },
            ]}
          />
        </Field>
        <Field label="Default backup retention" htmlFor="retention" hint="Applied to newly created servers. Each server can override it.">
          <InputGroup
            id="retention"
            suffix="backups"
            type="number"
            min={1}
            max={500}
            value={form.defaultBackupRetention}
            onChange={(e) => setForm({ ...form, defaultBackupRetention: Number(e.target.value) })}
          />
        </Field>
      </div>
      <CardFooter>
        <Button variant="primary" onClick={save} loading={saving}>
          <Save /> Save
        </Button>
      </CardFooter>
    </Card>
  );
}
