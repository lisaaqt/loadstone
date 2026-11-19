"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { FileKey, KeyRound, PlugZap, Save } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/client";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Skeleton, Switch } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";

interface Storage {
  enabled: boolean;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  prefix: string;
}

interface Sftp {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  authMethod: "password" | "key";
  password: string;
  privateKey: string;
  passphrase: string;
  path: string;
}

function useSave(label: string, mutate: () => Promise<unknown>) {
  const [saving, setSaving] = useState(false);
  async function save(body: object) {
    setSaving(true);
    try {
      await api("/api/settings", { method: "PUT", body });
      toast.success(`${label} saved`);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }
  return { saving, save };
}

export default function StorageSettingsPage() {
  const { data, mutate } = useSWR<{ storage: Storage; sftp: Sftp }>(
    "/api/settings",
  );
  const [form, setForm] = useState<Storage | null>(null);
  const [sftp, setSftp] = useState<Sftp | null>(null);
  const s3Save = useSave("S3 settings", mutate);
  const sftpSave = useSave("SFTP settings", mutate);
  const [testing, setTesting] = useState(false);
  const [editing, setEditing] = useState<"s3" | "sftp">("s3");
  useEffect(() => {
    if (data && !form) setForm(data.storage);
    if (data && !sftp) setSftp(data.sftp);
  }, [data, form, sftp]);

  if (!form || !sftp) return <Skeleton className="h-64" />;
  const set = <K extends keyof Storage>(k: K, v: Storage[K]) =>
    setForm({ ...form, [k]: v });
  const setS = <K extends keyof Sftp>(k: K, v: Sftp[K]) =>
    setSftp({ ...sftp, [k]: v });

  async function test() {
    setTesting(true);
    try {
      await api("/api/settings/sftp/test", { body: { sftp } });
      toast.success("SFTP connection works", {
        description: `Wrote and removed a test file in ${sftp?.path}`,
      });
    } catch (err) {
      toast.error("SFTP test failed", { description: errorMessage(err) });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[13px] font-medium">Storage to configure</div>
            <div className="text-xs text-muted">
              Pick a backup target to edit. Enabled targets can be chosen when
              creating backups.
            </div>
          </div>
          <div className="w-full sm:w-72">
            <Select
              value={editing}
              onValueChange={(v) => setEditing(v as "s3" | "sftp")}
              options={[
                {
                  value: "s3",
                  label: "S3-compatible",
                  description: form.enabled ? "Enabled" : "Disabled",
                },
                {
                  value: "sftp",
                  label: "SFTP server",
                  description: sftp.enabled ? "Enabled" : "Disabled",
                },
              ]}
            />
          </div>
        </div>
      </Card>
      {editing === "s3" && (
        <Card>
          <CardHeader
            title="S3-compatible storage"
            description="Store backups off-node in MinIO, AWS S3, Cloudflare R2, Backblaze B2 or any S3-compatible service. Agents upload directly."
            actions={
              <Switch
                checked={form.enabled}
                onCheckedChange={(v) => set("enabled", v)}
                aria-label="Enable S3 storage"
              />
            }
          />
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
            <Field
              label="Endpoint"
              htmlFor="s3-endpoint"
              hint="Leave empty for AWS. MinIO: http://minio:9000"
              className="sm:col-span-2"
            >
              <Input
                id="s3-endpoint"
                value={form.endpoint}
                onChange={(e) => set("endpoint", e.target.value)}
                placeholder="https://s3.example.com"
                disabled={!form.enabled}
              />
            </Field>
            <Field label="Bucket" htmlFor="s3-bucket">
              <Input
                id="s3-bucket"
                value={form.bucket}
                onChange={(e) => set("bucket", e.target.value)}
                disabled={!form.enabled}
              />
            </Field>
            <Field label="Region" htmlFor="s3-region">
              <Input
                id="s3-region"
                value={form.region}
                onChange={(e) => set("region", e.target.value)}
                disabled={!form.enabled}
              />
            </Field>
            <Field label="Access key ID" htmlFor="s3-key">
              <Input
                id="s3-key"
                value={form.accessKeyId}
                onChange={(e) => set("accessKeyId", e.target.value)}
                disabled={!form.enabled}
                autoComplete="off"
              />
            </Field>
            <Field
              label="Secret access key"
              htmlFor="s3-secret"
              hint="Encrypted at rest with APP_SECRET."
            >
              <Input
                id="s3-secret"
                type="password"
                value={form.secretAccessKey}
                onChange={(e) => set("secretAccessKey", e.target.value)}
                disabled={!form.enabled}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Key prefix" htmlFor="s3-prefix">
              <Input
                id="s3-prefix"
                value={form.prefix}
                onChange={(e) => set("prefix", e.target.value)}
                disabled={!form.enabled}
              />
            </Field>
            <label className="flex items-center justify-between gap-3 self-end rounded-md border border-border px-3 py-2">
              <span className="text-[13px]">Path-style addressing</span>
              <Switch
                checked={form.forcePathStyle}
                onCheckedChange={(v) => set("forcePathStyle", v)}
                disabled={!form.enabled}
              />
            </label>
          </div>
          <CardFooter>
            <Button
              variant="primary"
              onClick={() => s3Save.save({ storage: form })}
              loading={s3Save.saving}
            >
              <Save /> Save S3
            </Button>
          </CardFooter>
        </Card>
      )}

      {editing === "sftp" && (
        <Card>
          <CardHeader
            title="SFTP storage"
            description="Upload backups to any server reachable over SSH (a NAS, a storage box or another VPS). Authenticate with a password or an SSH key."
            actions={
              <Switch
                checked={sftp.enabled}
                onCheckedChange={(v) => setS("enabled", v)}
                aria-label="Enable SFTP storage"
              />
            }
          />
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-[1fr_120px]">
            <Field label="Host" htmlFor="sftp-host">
              <Input
                id="sftp-host"
                value={sftp.host}
                onChange={(e) => setS("host", e.target.value)}
                placeholder="backup.example.com"
                disabled={!sftp.enabled}
              />
            </Field>
            <Field label="Port" htmlFor="sftp-port">
              <Input
                id="sftp-port"
                type="number"
                min={1}
                max={65535}
                value={sftp.port}
                onChange={(e) => setS("port", Number(e.target.value) || 22)}
                disabled={!sftp.enabled}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-2">
              <Field label="Username" htmlFor="sftp-user">
                <Input
                  id="sftp-user"
                  value={sftp.username}
                  onChange={(e) => setS("username", e.target.value)}
                  disabled={!sftp.enabled}
                  autoComplete="off"
                />
              </Field>
              <Field label="Authentication" htmlFor="sftp-auth">
                <div
                  id="sftp-auth"
                  role="radiogroup"
                  className="grid h-9 grid-cols-2 gap-1 rounded-lg border border-border bg-surface-2/60 p-1 dark:bg-white/[0.03]"
                >
                  {(
                    [
                      { value: "password", label: "Password", icon: KeyRound },
                      { value: "key", label: "SSH key", icon: FileKey },
                    ] as const
                  ).map((opt) => {
                    const active = sftp.authMethod === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={!sftp.enabled}
                        onClick={() => setS("authMethod", opt.value)}
                        className={cn(
                          "flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 text-xs font-medium transition-colors disabled:opacity-50",
                          active
                            ? "bg-surface text-foreground shadow-soft ring-1 ring-border dark:bg-white/[0.08]"
                            : "text-muted hover:text-foreground",
                        )}
                      >
                        <opt.icon className="size-3.5" />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </div>
            {sftp.authMethod === "password" ? (
              <Field
                label="Password"
                htmlFor="sftp-password"
                hint="Encrypted at rest with APP_SECRET."
                className="sm:col-span-2"
              >
                <Input
                  id="sftp-password"
                  type="password"
                  value={sftp.password}
                  onChange={(e) => setS("password", e.target.value)}
                  disabled={!sftp.enabled}
                  autoComplete="new-password"
                />
              </Field>
            ) : (
              <>
                <Field
                  label="Private key"
                  htmlFor="sftp-key"
                  hint="OpenSSH or PEM format, e.g. the contents of ~/.ssh/id_ed25519. Encrypted at rest."
                  className="sm:col-span-2"
                >
                  <Textarea
                    id="sftp-key"
                    rows={5}
                    className="font-mono text-xs"
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    value={sftp.privateKey}
                    onChange={(e) => setS("privateKey", e.target.value)}
                    disabled={!sftp.enabled}
                  />
                </Field>
                <Field
                  label="Key passphrase"
                  htmlFor="sftp-passphrase"
                  hint="Only if the key is protected."
                  className="sm:col-span-2"
                >
                  <Input
                    id="sftp-passphrase"
                    type="password"
                    value={sftp.passphrase}
                    onChange={(e) => setS("passphrase", e.target.value)}
                    disabled={!sftp.enabled}
                    autoComplete="new-password"
                  />
                </Field>
              </>
            )}
            <Field
              label="Remote folder"
              htmlFor="sftp-path"
              hint="Backups go to <folder>/<server id>/<backup id>.tar.gz"
              className="sm:col-span-2"
            >
              <Input
                id="sftp-path"
                className="font-mono text-xs"
                value={sftp.path}
                onChange={(e) => setS("path", e.target.value)}
                disabled={!sftp.enabled}
              />
            </Field>
          </div>
          <CardFooter>
            <Button onClick={test} loading={testing} disabled={!sftp.enabled}>
              <PlugZap /> Test connection
            </Button>
            <Button
              variant="primary"
              onClick={() => sftpSave.save({ sftp })}
              loading={sftpSave.saving}
            >
              <Save /> Save SFTP
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
