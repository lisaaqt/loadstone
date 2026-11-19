"use client";

import { useState } from "react";
import useSWR from "swr";
import { MoreHorizontal, Plus, Shield, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/client";
import { timeAgo } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/misc";
import { Table, Td, Th, Tr } from "@/components/ui/layout";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "USER";
  createdAt: string;
  _count: { servers: number };
}

export default function UsersPage() {
  const { data, mutate } = useSWR<{ users: UserRow[] }>("/api/users");
  const [editing, setEditing] = useState<UserRow | "new" | null>(null);
  const [remove, setRemove] = useState<UserRow | null>(null);

  async function update(u: UserRow, body: Record<string, unknown>, msg: string) {
    try {
      await api(`/api/users/${u.id}`, { method: "PATCH", body });
      toast.success(msg);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader
        title="Users"
        description="Administrators manage nodes and all servers. Members can only operate servers they own."
        actions={
          <Button size="sm" variant="primary" onClick={() => setEditing("new")}>
            <Plus /> Add user
          </Button>
        }
      />
      {!data ? (
        <div className="p-4">
          <Skeleton className="h-10" />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>User</Th>
              <Th>Role</Th>
              <Th>Servers</Th>
              <Th>Joined</Th>
              <Th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {data.users.map((u) => (
              <Tr key={u.id}>
                <Td>
                  <div className="font-medium">{u.name}</div>
                  <div className="text-xs text-muted">{u.email}</div>
                </Td>
                <Td>
                  <Badge tone={u.role === "ADMIN" ? "primary" : "neutral"}>{u.role === "ADMIN" ? "Admin" : "Member"}</Badge>
                </Td>
                <Td className="text-muted tabular">{u._count.servers}</Td>
                <Td className="text-muted">{timeAgo(u.createdAt)}</Td>
                <Td>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon-sm" variant="ghost" aria-label="User actions">
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onSelect={() => setEditing(u)}>
                        <User /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void update(u, { role: u.role === "ADMIN" ? "USER" : "ADMIN" }, "Role updated")}>
                        <Shield /> {u.role === "ADMIN" ? "Make member" : "Make admin"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem destructive onSelect={() => setRemove(u)}>
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
      {editing && (
        <UserDialog
          user={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void mutate();
          }}
        />
      )}
      <ConfirmDialog
        open={remove !== null}
        onOpenChange={(o) => !o && setRemove(null)}
        title={`Delete ${remove?.name}?`}
        description="Their sessions and API tokens are revoked. Users that still own servers cannot be deleted."
        confirmLabel="Delete user"
        destructive
        onConfirm={async () => {
          if (!remove) return;
          try {
            await api(`/api/users/${remove.id}`, { method: "DELETE" });
            toast.success("User deleted");
            setRemove(null);
            await mutate();
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />
    </Card>
  );
}

function UserDialog({ user, onClose, onSaved }: { user: UserRow | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: user?.name ?? "", email: user?.email ?? "", password: "", role: user?.role ?? "USER" });
  const [loading, setLoading] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={user ? "Edit user" : "Add user"}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            try {
              const body = { ...form, password: form.password || undefined };
              await api(user ? `/api/users/${user.id}` : "/api/users", { method: user ? "PATCH" : "POST", body });
              toast.success(user ? "User updated" : "User created");
              onSaved();
            } catch (err) {
              toast.error(errorMessage(err));
            } finally {
              setLoading(false);
            }
          }}
        >
          <DialogBody>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Name" htmlFor="u-name">
                <Input id="u-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Role">
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as "ADMIN" | "USER" })} options={[{ value: "USER", label: "Member" }, { value: "ADMIN", label: "Administrator" }]} />
              </Field>
            </div>
            <Field label="Email" htmlFor="u-email">
              <Input id="u-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label={user ? "New password" : "Password"} htmlFor="u-pw" hint={user ? "Leave empty to keep the current password." : "At least 10 characters."}>
              <Input id="u-pw" type="password" autoComplete="new-password" minLength={10} required={!user} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={loading}>
              {user ? "Save" : "Create user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
