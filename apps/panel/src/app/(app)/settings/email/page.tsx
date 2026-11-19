"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Mail, RotateCcw, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/client";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Skeleton, Switch } from "@/components/ui/misc";
import { Select } from "@/components/ui/select";

interface Smtp {
  enabled: boolean;
  host: string;
  port: number;
  security: "starttls" | "tls" | "none";
  username: string;
  password: string;
  fromName: string;
  fromAddress: string;
}
type Template = {
  subject: string;
  heading: string;
  body: string;
  buttonLabel: string;
};
interface Definition extends Template {
  label: string;
  description: string;
  variables: readonly string[];
  hasButton: boolean;
}
const FIELD_LABEL: Record<keyof Template, string> = {
  subject: "subject",
  heading: "heading",
  body: "message",
  buttonLabel: "button text",
};
interface MailResponse {
  smtp: Smtp;
  templates: Record<string, Template>;
  definitions: Record<string, Definition>;
}

export default function EmailSettingsPage() {
  const { data, mutate } = useSWR<MailResponse>("/api/settings/mail");
  const [smtp, setSmtp] = useState<Smtp | null>(null);
  const [templates, setTemplates] = useState<Record<string, Template> | null>(
    null,
  );
  const [selected, setSelected] = useState("invite");
  const [testTo, setTestTo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [focus, setFocus] = useState<keyof Template>("body");
  const [preview, setPreview] = useState<{
    subject: string;
    html: string;
  } | null>(null);

  useEffect(() => {
    if (data && !smtp) setSmtp(data.smtp);
    if (data && !templates) setTemplates(data.templates);
  }, [data, smtp, templates]);

  const current = templates?.[selected];
  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => {
      api<{ subject: string; html: string }>("/api/settings/mail/preview", {
        body: { id: selected, template: current },
      })
        .then(setPreview)
        .catch(() => undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [selected, current]);

  if (!data || !smtp || !templates) return <Skeleton className="h-72" />;
  const set = <K extends keyof Smtp>(k: K, v: Smtp[K]) =>
    setSmtp({ ...smtp, [k]: v });
  const def = data.definitions[selected]!;
  const tpl = templates[selected]!;
  const setTpl = (patch: Partial<Template>) =>
    setTemplates({ ...templates, [selected]: { ...tpl, ...patch } });

  async function run(
    label: string,
    fn: () => Promise<unknown>,
    success: string,
  ) {
    setBusy(label);
    try {
      await fn();
      toast.success(success);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title="SMTP server"
          description="Used for invitations, access notifications and backup failure alerts. Without SMTP, invites still work as links."
          icon={<Mail />}
          actions={
            <Switch
              checked={smtp.enabled}
              onCheckedChange={(v) => set("enabled", v)}
              aria-label="Enable email"
            />
          }
        />
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-[1fr_120px_200px]">
          <Field label="Host" htmlFor="smtp-host">
            <Input
              id="smtp-host"
              placeholder="smtp.example.com"
              value={smtp.host}
              onChange={(e) => set("host", e.target.value)}
              disabled={!smtp.enabled}
            />
          </Field>
          <Field label="Port" htmlFor="smtp-port">
            <Input
              id="smtp-port"
              type="number"
              value={smtp.port}
              onChange={(e) => set("port", Number(e.target.value) || 587)}
              disabled={!smtp.enabled}
            />
          </Field>
          <Field label="Encryption" htmlFor="smtp-security">
            <Select
              id="smtp-security"
              value={smtp.security}
              onValueChange={(v) => {
                const security = v as Smtp["security"];
                setSmtp({
                  ...smtp,
                  security,
                  port:
                    security === "tls"
                      ? 465
                      : smtp.port === 465
                        ? 587
                        : smtp.port,
                });
              }}
              disabled={!smtp.enabled}
              options={[
                {
                  value: "starttls",
                  label: "STARTTLS",
                  description: "Usually port 587",
                },
                {
                  value: "tls",
                  label: "TLS / SSL",
                  description: "Usually port 465",
                },
                {
                  value: "none",
                  label: "None",
                  description: "Only for local relays",
                },
              ]}
            />
          </Field>
          <Field label="Username" htmlFor="smtp-user">
            <Input
              id="smtp-user"
              value={smtp.username}
              onChange={(e) => set("username", e.target.value)}
              disabled={!smtp.enabled}
              autoComplete="off"
            />
          </Field>
          <Field
            label="Password"
            htmlFor="smtp-pass"
            hint="Encrypted at rest with APP_SECRET."
            className="sm:col-span-2"
          >
            <Input
              id="smtp-pass"
              type="password"
              value={smtp.password}
              onChange={(e) => set("password", e.target.value)}
              disabled={!smtp.enabled}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Sender name" htmlFor="smtp-from-name">
            <Input
              id="smtp-from-name"
              value={smtp.fromName}
              onChange={(e) => set("fromName", e.target.value)}
              disabled={!smtp.enabled}
            />
          </Field>
          <Field
            label="Sender address"
            htmlFor="smtp-from"
            className="sm:col-span-2"
          >
            <Input
              id="smtp-from"
              type="email"
              placeholder="panel@example.com"
              value={smtp.fromAddress}
              onChange={(e) => set("fromAddress", e.target.value)}
              disabled={!smtp.enabled}
            />
          </Field>
        </div>
        <CardFooter className="flex-wrap">
          <div className="flex min-w-0 flex-1 gap-2">
            <Input
              type="email"
              placeholder="Send a test to…"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              disabled={!smtp.enabled}
              className="max-w-xs"
            />
            <Button
              disabled={!smtp.enabled || !testTo}
              loading={busy === "test"}
              onClick={() =>
                run(
                  "test",
                  () =>
                    api("/api/settings/mail/test", {
                      body: { to: testTo, smtp },
                    }),
                  `Test email sent to ${testTo}`,
                )
              }
            >
              <Send /> Send test email
            </Button>
          </div>
          <Button
            variant="primary"
            loading={busy === "smtp"}
            onClick={() =>
              run(
                "smtp",
                async () => (
                  await api("/api/settings/mail", {
                    method: "PUT",
                    body: { smtp },
                  }),
                  mutate()
                ),
                "SMTP settings saved",
              )
            }
          >
            <Save /> Save SMTP
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader
          title="Mail templates"
          description="Customize the subject, heading, message and button of each email. Placeholders in {{double braces}} are filled in when sending."
        />
        <div className="grid grid-cols-1 gap-5 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div className="flex flex-col gap-4">
            <Field label="Template" htmlFor="tpl-select">
              <Select
                id="tpl-select"
                value={selected}
                onValueChange={setSelected}
                options={Object.entries(data.definitions).map(([id, d]) => ({
                  value: id,
                  label: d.label,
                  description: d.description,
                }))}
              />
            </Field>
            <Field label="Subject" htmlFor="tpl-subject">
              <Input
                id="tpl-subject"
                value={tpl.subject}
                onFocus={() => setFocus("subject")}
                onChange={(e) => setTpl({ subject: e.target.value })}
              />
            </Field>
            <Field
              label="Heading"
              htmlFor="tpl-heading"
              hint="Large title at the top of the email. Leave empty for none."
            >
              <Input
                id="tpl-heading"
                value={tpl.heading}
                onFocus={() => setFocus("heading")}
                onChange={(e) => setTpl({ heading: e.target.value })}
              />
            </Field>
            <Field
              label="Message"
              htmlFor="tpl-body"
              hint='Blank line = new paragraph. Start a paragraph with "> " to show it as a highlighted note. Links become clickable.'
            >
              <Textarea
                id="tpl-body"
                rows={8}
                className="font-mono text-xs"
                value={tpl.body}
                onFocus={() => setFocus("body")}
                onChange={(e) => setTpl({ body: e.target.value })}
              />
            </Field>
            {def.hasButton && (
              <Field
                label="Button text"
                htmlFor="tpl-button"
                hint="The button links to the invitation or server page."
              >
                <Input
                  id="tpl-button"
                  value={tpl.buttonLabel}
                  onFocus={() => setFocus("buttonLabel")}
                  onChange={(e) => setTpl({ buttonLabel: e.target.value })}
                />
              </Field>
            )}
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
              Insert into {FIELD_LABEL[focus]}:
              {[...def.variables, "panelName", "panelUrl"].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTpl({ [focus]: `${tpl[focus]}{{${v}}}` })}
                  className="rounded-md border border-border bg-surface-2/70 px-1.5 py-0.5 font-mono text-[11px] hover:text-foreground dark:bg-white/[0.03]"
                >
                  {`{{${v}}}`}
                </button>
              ))}
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-muted">
              <span className="font-medium text-foreground">Preview</span>
              <span>with sample values</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-border bg-surface-2/60 dark:bg-white/[0.02]">
              <div className="border-b border-border px-3 py-2 text-xs">
                <span className="text-subtle">Subject: </span>
                <span className="font-medium">{preview?.subject ?? "…"}</span>
              </div>
              {preview ? (
                <iframe
                  title="Email preview"
                  sandbox=""
                  srcDoc={preview.html}
                  className="h-[520px] w-full bg-white"
                />
              ) : (
                <Skeleton className="h-[520px] rounded-none" />
              )}
            </div>
          </div>
        </div>
        <CardFooter>
          <Button
            variant="ghost"
            onClick={() =>
              setTpl({
                subject: def.subject,
                heading: def.heading,
                body: def.body,
                buttonLabel: def.buttonLabel,
              })
            }
          >
            <RotateCcw /> Reset to default
          </Button>
          <Button
            variant="primary"
            loading={busy === "templates"}
            onClick={() =>
              run(
                "templates",
                async () => (
                  await api("/api/settings/mail", {
                    method: "PUT",
                    body: { templates },
                  }),
                  mutate()
                ),
                "Templates saved",
              )
            }
          >
            <Save /> Save templates
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
