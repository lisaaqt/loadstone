"use client";

import { useState } from "react";
import useSWR from "swr";
import { Check, Copy, KeyRound, Laptop, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/client";
import { formatDate, timeAgo } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/misc";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

interface SessionRow {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

interface TokenRow {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

function describeAgent(ua: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return `${browser}${os ? ` on ${os}` : ""}`;
}

export default function SecurityPage() {
  const sessions = useSWR<{ sessions: SessionRow[] }>("/api/account/sessions");
  const tokens = useSWR<{ tokens: TokenRow[] }>("/api/account/tokens");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  async function revokeSession(id?: string) {
    try {
      await api(`/api/account/sessions${id ? `?id=${id}` : ""}`, { method: "DELETE" });
      toast.success(id ? "Session revoked" : "Signed out of all other sessions");
      await sessions.mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function revokeToken(id: string) {
    try {
      await api(`/api/account/tokens?id=${id}`, { method: "DELETE" });
      toast.success("Token revoked");
      await tokens.mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardHeader
          title="Active sessions"
          description="Devices currently signed in to your account."
          actions={
            <Button size="sm" variant="outline" onClick={() => void revokeSession()}>
              Sign out others
            </Button>
          }
        />
        {!sessions.data ? (
          <div className="p-4">
            <Skeleton className="h-10" />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {sessions.data.sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                <Laptop className="size-4 text-muted" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[13px]">
                    {describeAgent(s.userAgent)}
                    {s.current && <Badge tone="success">This device</Badge>}
                  </div>
                  <div className="text-xs text-muted">
                    <span className="font-mono">{s.ip ?? "unknown ip"}</span> · active {timeAgo(s.lastSeenAt)} · signed in {formatDate(s.createdAt)}
                  </div>
                </div>
                {!s.current && (
                  <Button size="sm" variant="ghost" onClick={() => void revokeSession(s.id)}>
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="API tokens"
          description="Authenticate scripts against the REST API with Authorization: Bearer <token>. Tokens act with your permissions."
          actions={
            <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
              <Plus /> New token
            </Button>
          }
        />
        {!tokens.data ? (
          <div className="p-4">
            <Skeleton className="h-10" />
          </div>
        ) : tokens.data.tokens.length === 0 ? (
          <EmptyState icon={KeyRound} title="No API tokens" className="py-10" />
        ) : (
          <ul className="divide-y divide-border">
            {tokens.data.tokens.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <KeyRound className="size-4 text-muted" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium">{t.name}</div>
                  <div className="text-xs text-muted">
                    <span className="font-mono">{t.prefix}_…</span> · created {timeAgo(t.createdAt)} · last used {timeAgo(t.lastUsedAt)}
                    {t.expiresAt && ` · expires ${formatDate(t.expiresAt)}`}
                  </div>
                </div>
                <Button size="icon-sm" variant="ghost" onClick={() => void revokeToken(t.id)} aria-label="Revoke token">
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {creating && (
        <CreateTokenDialog
          onClose={() => setCreating(false)}
          onCreated={(token) => {
            setCreating(false);
            setCreated(token);
            void tokens.mutate();
          }}
        />
      )}
      {created && <RevealDialog token={created} onClose={() => setCreated(null)} />}
    </div>
  );
}

function CreateTokenDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (t: string) => void }) {
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("90");
  const [loading, setLoading] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="New API token" size="sm">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            try {
              const res = await api<{ token: string }>("/api/account/tokens", { body: { name, expiresInDays: expiry === "never" ? null : Number(expiry) } });
              onCreated(res.token);
            } catch (err) {
              toast.error(errorMessage(err));
            } finally {
              setLoading(false);
            }
          }}
        >
          <DialogBody>
            <Field label="Name" htmlFor="tok-name">
              <Input id="tok-name" autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="CI deploy" maxLength={64} />
            </Field>
            <Field label="Expiration">
              <Select
                value={expiry}
                onValueChange={setExpiry}
                options={[
                  { value: "30", label: "30 days" },
                  { value: "90", label: "90 days" },
                  { value: "365", label: "1 year" },
                  { value: "never", label: "Never" },
                ]}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={loading}>
              Create token
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RevealDialog({ token, onClose }: { token: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Copy your token" description="It won't be shown again.">
        <DialogBody>
          <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2 p-2.5">
            <code className="flex-1 break-all font-mono text-xs">{token}</code>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => {
                void navigator.clipboard.writeText(token);
                setCopied(true);
              }}
              aria-label="Copy token"
            >
              {copied ? <Check className="text-success" /> : <Copy />}
            </Button>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
