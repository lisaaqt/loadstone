"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/client";

export function InviteForm({ token, signedIn }: { token: string; signedIn: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ serverId: string }>(`/api/invites/${token}`, { body: signedIn ? {} : form });
      router.replace(`/servers/${res.serverId}`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl bg-surface p-6 shadow-pop">
      {!signedIn && (
        <>
          <Field label="Name" htmlFor="name">
            <Input id="name" required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Password" htmlFor="password" hint="At least 10 characters.">
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              minLength={10}
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
        </>
      )}
      {error && <p className="rounded-md border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
      <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
        {signedIn ? "Accept invitation" : "Create account and join"}
      </Button>
      {!signedIn && (
        <p className="text-center text-xs text-muted">
          Already have an account?{" "}
          <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} className="font-medium text-primary hover:underline dark:text-primary-strong">
            Sign in first
          </Link>
        </p>
      )}
    </form>
  );
}
