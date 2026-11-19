"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { api, errorMessage } from "@/lib/client";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/misc";

export default function AccountPage() {
  return (
    <div className="flex flex-col gap-3">
      <ProfileCard />
      <PasswordCard />
      <AppearanceCard />
    </div>
  );
}

function ProfileCard() {
  const router = useRouter();
  const { data } = useSWR<{ user: { name: string; email: string } }>("/api/account/me");
  const [form, setForm] = useState<{ name: string; email: string; currentPassword: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const values = form ?? (data ? { name: data.user.name, email: data.user.email, currentPassword: "" } : null);
  const emailChanged = values && data && values.email !== data.user.email;

  async function save() {
    if (!values) return;
    setSaving(true);
    try {
      await api("/api/account", { method: "PATCH", body: { name: values.name, email: values.email, currentPassword: values.currentPassword || undefined } });
      toast.success("Profile updated");
      setForm(null);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Profile" />
      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="acc-name">
          <Input id="acc-name" value={values?.name ?? ""} onChange={(e) => values && setForm({ ...values, name: e.target.value })} />
        </Field>
        <Field label="Email" htmlFor="acc-email">
          <Input id="acc-email" type="email" value={values?.email ?? ""} onChange={(e) => values && setForm({ ...values, email: e.target.value })} />
        </Field>
        {emailChanged && (
          <Field label="Current password" htmlFor="acc-cur" hint="Required to change your email.">
            <Input id="acc-cur" type="password" value={values.currentPassword} onChange={(e) => setForm({ ...values, currentPassword: e.target.value })} />
          </Field>
        )}
      </div>
      <CardFooter>
        <Button variant="primary" onClick={save} loading={saving} disabled={!form}>
          <Save /> Save profile
        </Button>
      </CardFooter>
    </Card>
  );
}

function PasswordCard() {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (form.newPassword !== form.confirm) return toast.error("Passwords do not match");
    setSaving(true);
    try {
      await api("/api/account", { method: "PATCH", body: { currentPassword: form.currentPassword, newPassword: form.newPassword } });
      toast.success("Password changed", { description: "Other sessions have been signed out." });
      setForm({ currentPassword: "", newPassword: "", confirm: "" });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <form onSubmit={save}>
        <CardHeader title="Password" description="Changing your password signs out all other sessions." />
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
          <Field label="Current password" htmlFor="pw-cur">
            <Input id="pw-cur" type="password" autoComplete="current-password" required value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
          </Field>
          <Field label="New password" htmlFor="pw-new">
            <Input id="pw-new" type="password" autoComplete="new-password" minLength={10} required value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />
          </Field>
          <Field label="Confirm" htmlFor="pw-confirm">
            <Input id="pw-confirm" type="password" autoComplete="new-password" required value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
          </Field>
        </div>
        <CardFooter>
          <Button type="submit" variant="primary" loading={saving}>
            Update password
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  return (
    <Card>
      <CardHeader title="Appearance" description="Choose how Loadstone looks to you." />
      <div className="p-4">
        <Tabs value={theme ?? "dark"} onValueChange={setTheme}>
          <TabsList>
            <TabsTrigger value="dark">Dark</TabsTrigger>
            <TabsTrigger value="light">Light</TabsTrigger>
            <TabsTrigger value="system">System</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </Card>
  );
}
