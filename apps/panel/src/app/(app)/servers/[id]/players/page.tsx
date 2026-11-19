"use client";

import { useState } from "react";
import useSWR from "swr";
import { Ban, Crown, DoorOpen, ListChecks, MoreHorizontal, Plus, ShieldOff, UserMinus, Users } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/client";
import { timeAgo } from "@/lib/format";
import { useServer } from "@/components/servers/use-server";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/layout";
import { Skeleton, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";

interface PlayerRef {
  uuid: string;
  name: string;
}

interface PlayersResponse {
  running: boolean;
  online: { online: number; max: number; players: string[] } | null;
  whitelistEnabled: boolean;
  whitelist: PlayerRef[];
  ops: (PlayerRef & { level: number })[];
  banned: (PlayerRef & { reason: string; created: string; source: string })[];
  known: (PlayerRef & { expiresOn?: string })[];
}

type Action = "whitelist-add" | "whitelist-remove" | "op" | "deop" | "ban" | "pardon" | "kick";

function Head({ id, size = 24 }: { id: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://mc-heads.net/avatar/${encodeURIComponent(id)}/${size * 2}`}
      alt=""
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      className="shrink-0 rounded-[4px] bg-surface-3 [image-rendering:pixelated]"
    />
  );
}

export default function PlayersPage() {
  const server = useServer();
  const base = `/api/servers/${server.id}/players`;
  const { data, isLoading, mutate } = useSWR<PlayersResponse>(base, { refreshInterval: server.state === "RUNNING" ? 10_000 : 0 });
  const [reasonFor, setReasonFor] = useState<{ action: "ban" | "kick"; player: string } | null>(null);

  async function act(action: Action, player: string, reason?: string) {
    try {
      const res = await api<{ applied: "live" | "file" }>(base, { body: { action, player, reason } });
      toast.success(`${labelFor(action)} ${player}`, { description: res.applied === "file" ? "Saved to file, applies on next start." : undefined });
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function toggleWhitelist(enabled: boolean) {
    try {
      await api(base, { body: { action: "whitelist-toggle", enabled } });
      toast.success(`Whitelist ${enabled ? "enabled" : "disabled"}`);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const menu = (name: string, opts: { online?: boolean } = {}) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label="Player actions">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {opts.online && (
          <DropdownMenuItem onSelect={() => setReasonFor({ action: "kick", player: name })}>
            <DoorOpen /> Kick
          </DropdownMenuItem>
        )}
        {data?.ops.some((o) => o.name.toLowerCase() === name.toLowerCase()) ? (
          <DropdownMenuItem onSelect={() => void act("deop", name)}>
            <ShieldOff /> Remove operator
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => void act("op", name)}>
            <Crown /> Make operator
          </DropdownMenuItem>
        )}
        {data?.whitelist.some((w) => w.name.toLowerCase() === name.toLowerCase()) ? (
          <DropdownMenuItem onSelect={() => void act("whitelist-remove", name)}>
            <UserMinus /> Remove from whitelist
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => void act("whitelist-add", name)}>
            <ListChecks /> Add to whitelist
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={() => setReasonFor({ action: "ban", player: name })}>
          <Ban /> Ban
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (isLoading || !data) {
    return (
      <div className="grid gap-3 lg:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40 lg:col-span-2" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <Card>
        <CardHeader
          title="Online"
          description={data.running ? (data.online ? `${data.online.online} of ${data.online.max} players` : "Player list unavailable") : "Server is offline"}
        />
        {data.online?.players.length ? (
          <ul className="divide-y divide-border">
            {data.online.players.map((p) => (
              <li key={p} className="flex items-center gap-2.5 px-4 py-2">
                <Head id={p} />
                <span className="flex-1 truncate text-[13px]">{p}</span>
                {data.ops.some((o) => o.name === p) && <Crown className="size-3.5 text-warning" />}
                {menu(p, { online: true })}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={Users} title="Nobody online" className="py-10" />
        )}
      </Card>

      <Card className="lg:col-span-2">
        <Tabs defaultValue="whitelist">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
            <TabsList>
              <TabsTrigger value="whitelist">Whitelist {data.whitelist.length}</TabsTrigger>
              <TabsTrigger value="ops">Operators {data.ops.length}</TabsTrigger>
              <TabsTrigger value="bans">Bans {data.banned.length}</TabsTrigger>
              <TabsTrigger value="history">History {data.known.length}</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="whitelist">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <div className="text-[13px] font-medium">Enforce whitelist</div>
                <div className="text-xs text-muted">Only whitelisted players can join.</div>
              </div>
              <Switch checked={data.whitelistEnabled} onCheckedChange={(v) => void toggleWhitelist(v)} />
            </div>
            <AddPlayer placeholder="Add player to whitelist" onAdd={(n) => act("whitelist-add", n)} />
            <PlayerList players={data.whitelist} empty="No whitelisted players" action={(p) => (
              <Button size="sm" variant="ghost" onClick={() => void act("whitelist-remove", p.name)}>
                Remove
              </Button>
            )} />
          </TabsContent>
          <TabsContent value="ops">
            <AddPlayer placeholder="Grant operator to player" onAdd={(n) => act("op", n)} />
            <PlayerList
              players={data.ops}
              empty="No operators"
              meta={(p) => <Badge>Level {(p as (typeof data.ops)[number]).level}</Badge>}
              action={(p) => (
                <Button size="sm" variant="ghost" onClick={() => void act("deop", p.name)}>
                  Revoke
                </Button>
              )}
            />
          </TabsContent>
          <TabsContent value="bans">
            <AddPlayer placeholder="Ban player" label="Ban" onAdd={async (n) => setReasonFor({ action: "ban", player: n })} />
            <PlayerList
              players={data.banned}
              empty="No banned players"
              meta={(p) => <span className="truncate text-xs text-muted">{(p as (typeof data.banned)[number]).reason}</span>}
              action={(p) => (
                <Button size="sm" variant="ghost" onClick={() => void act("pardon", p.name)}>
                  Unban
                </Button>
              )}
            />
          </TabsContent>
          <TabsContent value="history">
            <PlayerList
              players={data.known}
              empty="No players have joined yet"
              meta={(p) => <span className="font-mono text-[11px] text-subtle">{p.uuid}</span>}
              action={(p) => menu(p.name)}
              sub={(p) => {
                const exp = (p as (typeof data.known)[number]).expiresOn;
                return exp ? `Last seen ~${timeAgo(new Date(new Date(exp.replace(" +0000", "Z").replace(" ", "T")).getTime() - 30 * 86400_000))}` : undefined;
              }}
            />
          </TabsContent>
        </Tabs>
      </Card>

      {reasonFor && (
        <ReasonDialog
          action={reasonFor.action}
          player={reasonFor.player}
          onClose={() => setReasonFor(null)}
          onSubmit={async (reason) => {
            await act(reasonFor.action, reasonFor.player, reason);
            setReasonFor(null);
          }}
        />
      )}
    </div>
  );
}

function labelFor(action: Action) {
  return { "whitelist-add": "Whitelisted", "whitelist-remove": "Removed from whitelist:", op: "Opped", deop: "De-opped", ban: "Banned", pardon: "Unbanned", kick: "Kicked" }[action];
}

function AddPlayer({ placeholder, onAdd, label = "Add" }: { placeholder: string; onAdd: (name: string) => Promise<void>; label?: string }) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <form
      className="flex gap-2 border-b border-border px-4 py-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!/^[A-Za-z0-9_]{1,16}$/.test(name)) return toast.error("Enter a valid Minecraft username");
        setLoading(true);
        await onAdd(name);
        setLoading(false);
        setName("");
      }}
    >
      <Input value={name} onChange={(e) => setName(e.target.value.trim())} placeholder={placeholder} maxLength={16} />
      <Button type="submit" variant="outline" loading={loading} disabled={!name}>
        <Plus /> {label}
      </Button>
    </form>
  );
}

function PlayerList({
  players,
  empty,
  action,
  meta,
  sub,
}: {
  players: PlayerRef[];
  empty: string;
  action: (p: PlayerRef) => React.ReactNode;
  meta?: (p: PlayerRef) => React.ReactNode;
  sub?: (p: PlayerRef) => string | undefined;
}) {
  if (!players.length) return <p className="px-4 py-8 text-center text-[13px] text-muted">{empty}</p>;
  return (
    <ul className="max-h-[480px] divide-y divide-border overflow-y-auto">
      {players.map((p) => (
        <li key={p.uuid || p.name} className="flex items-center gap-2.5 px-4 py-2">
          <Head id={p.uuid || p.name} />
          <div className="min-w-0 flex-1">
            <div className="text-[13px]">{p.name}</div>
            {sub?.(p) && <div className="text-xs text-muted">{sub(p)}</div>}
          </div>
          {meta && <div className="hidden max-w-[40%] sm:block">{meta(p)}</div>}
          {action(p)}
        </li>
      ))}
    </ul>
  );
}

function ReasonDialog({ action, player, onClose, onSubmit }: { action: "ban" | "kick"; player: string; onClose: () => void; onSubmit: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`${action === "ban" ? "Ban" : "Kick"} ${player}`} size="sm">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            await onSubmit(reason);
            setLoading(false);
          }}
        >
          <DialogBody>
            <Field label="Reason" htmlFor="reason" hint="Optional. Shown to the player.">
              <Input id="reason" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={loading}>
              {action === "ban" ? "Ban player" : "Kick player"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
