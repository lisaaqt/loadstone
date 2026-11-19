"use client";

import { useState } from "react";
import useSWR from "swr";
import { Copy, Link2, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/client";
import { formatDate, timeAgo } from "@/lib/format";
import { useServer } from "@/components/servers/use-server";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/layout";

interface MembersResponse {
  owner: { id: string; name: string; email: string } | null;
  members: { id: string; createdAt: string; user: { id: string; name: string; email: string } }[];
  invites: { id: string; createdAt: string; expiresAt: string }[];
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

function Person({ name, email, children }: { name: string; email: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--primary),color-mix(in_oklab,var(--primary)_45%,var(--info)))] text-[11px] font-semibold text-white">
        {initials(name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium">{name}</div>
        <div className="truncate text-xs text-muted">{email}</div>
      </div>
      {children}
    </div>
  );
}

export default function MembersPage() {
  const server = useServer();
  const key = `/api/servers/${server.id}/members`;
  const { data, mutate } = useSWR<MembersResponse>(server.canManage ? key : null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");

  if (!server.canManage) {
    return <EmptyState icon={Users} title="Members are managed by the owner" description="Only the server owner or an administrator can invite people." />;
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy("add");
    try {
      await api(key, { body: { email } });
      toast.success("Member added", { description: email });
      setEmail("");
      await mutate();
    } catch (err) {
      toast.error("Could not add member", { description: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  async function createLink() {
    setBusy("link");
    try {
      const res = await api<{ url: string; emailed: boolean }>(`/api/servers/${server.id}/invites`, { body: inviteEmail ? { email: inviteEmail } : {} });
      setLink(res.url);
      await navigator.clipboard.writeText(res.url).catch(() => undefined);
      if (inviteEmail && res.emailed) toast.success(`Invitation sent to ${inviteEmail}`, { description: "The link was also copied. Valid for 7 days, single use." });
      else if (inviteEmail) toast.warning("Invite link created and copied, but email is not set up", { description: "Configure SMTP under Settings → Email." });
      else toast.success("Invite link created and copied", { description: "Valid for 7 days, can be used once." });
      setInviteEmail("");
      await mutate();
    } catch (err) {
      toast.error("Could not create invite", { description: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  async function remove(memberId: string, name: string) {
    setBusy(memberId);
    try {
      await api(`${key}?memberId=${memberId}`, { method: "DELETE" });
      toast.success(`${name} no longer has access`);
      await mutate();
    } catch (err) {
      toast.error("Could not remove member", { description: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  async function revoke(inviteId: string) {
    setBusy(inviteId);
    try {
      await api(`/api/servers/${server.id}/invites?inviteId=${inviteId}`, { method: "DELETE" });
      await mutate();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader title="People with access" description="Members can use everything except members, reinstall and deleting the server." icon={<Users />} />
        <div className="divide-y divide-border">
          {data?.owner && (
            <Person name={data.owner.name} email={data.owner.email}>
              <Badge tone="primary">Owner</Badge>
            </Person>
          )}
          {data?.members.map((m) => (
            <Person key={m.id} name={m.user.name} email={m.user.email}>
              <span className="hidden text-xs text-subtle sm:inline">joined {timeAgo(m.createdAt)}</span>
              <Button size="icon-sm" variant="ghost" aria-label={`Remove ${m.user.name}`} loading={busy === m.id} onClick={() => remove(m.id, m.user.name)}>
                <Trash2 />
              </Button>
            </Person>
          ))}
          {data && data.members.length === 0 && <p className="px-5 py-6 text-center text-[13px] text-muted">No members yet. Invite someone on the right.</p>}
        </div>
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader title="Add by email" description="For people who already have an account." icon={<UserPlus />} />
          <form onSubmit={add} className="flex gap-2 p-4">
            <Input type="email" required placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button type="submit" variant="primary" loading={busy === "add"}>
              Add
            </Button>
          </form>
        </Card>

        <Card>
          <CardHeader title="Invite link" description="New people create their account with it. Single use, 7 days." icon={<Link2 />} />
          <div className="flex flex-col gap-3 p-4">
            <Input type="email" placeholder="Email (optional, sends the link)" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
            <Button onClick={createLink} loading={busy === "link"}>
              <Link2 /> {inviteEmail ? "Create and email invite" : "Create invite link"}
            </Button>
            {link && (
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(link);
                  toast.success("Invite link copied");
                }}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface-2/70 px-3 py-2 text-left font-mono text-xs text-muted transition-colors hover:text-foreground dark:bg-white/[0.03]"
              >
                <span className="min-w-0 flex-1 truncate">{link}</span>
                <Copy className="size-3.5 shrink-0" />
              </button>
            )}
            {data && data.invites.length > 0 && (
              <div className="divide-y divide-border rounded-lg border border-border">
                {data.invites.map((i) => (
                  <div key={i.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                    <span className="text-muted">Open invite · expires {formatDate(i.expiresAt)}</span>
                    <Button size="sm" variant="ghost" loading={busy === i.id} onClick={() => revoke(i.id)}>
                      Revoke
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
