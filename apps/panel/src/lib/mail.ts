import nodemailer from "nodemailer";
import { z } from "zod";
import { db } from "./db";
import { decrypt, encrypt } from "./crypto";
import { getGeneralSettings } from "./settings";

export const smtpSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  host: z.string().trim().max(253).default(""),
  port: z.number().int().min(1).max(65535).default(587),
  security: z.enum(["starttls", "tls", "none"]).default("starttls"),
  username: z.string().trim().max(254).default(""),
  password: z.string().max(1024).default(""),
  fromName: z.string().trim().max(100).default("Loadstone"),
  fromAddress: z.string().trim().max(254).default(""),
});
export type SmtpSettings = z.infer<typeof smtpSettingsSchema>;

/**
 * Mail templates. Subject, heading, message and button text are editable in Settings → Email; the button always
 * links to `buttonVar`. Placeholders: the listed variables plus {{panelName}} and {{panelUrl}}.
 */
export const MAIL_TEMPLATES = {
  invite: {
    label: "Server invitation",
    description: "Sent when you invite someone to a server by email.",
    variables: ["inviterName", "serverName", "inviteUrl", "expiresAt"],
    buttonVar: "inviteUrl",
    sample: { inviterName: "Alex", serverName: "Survival SMP", inviteUrl: "https://panel.example.com/invite/abc123", expiresAt: "Nov 26, 2026" },
    subject: "{{inviterName}} invited you to {{serverName}}",
    heading: "You're invited to {{serverName}}",
    body: "{{inviterName}} invited you to help manage the Minecraft server {{serverName}} on {{panelName}}.\n\nThe invitation can be used once and expires on {{expiresAt}}.",
    buttonLabel: "Accept invitation",
  },
  memberAdded: {
    label: "Added to a server",
    description: "Sent when an existing user is added to a server.",
    variables: ["userName", "inviterName", "serverName", "serverUrl"],
    buttonVar: "serverUrl",
    sample: { userName: "Sam", inviterName: "Alex", serverName: "Survival SMP", serverUrl: "https://panel.example.com/servers/abc123" },
    subject: "You now have access to {{serverName}}",
    heading: "Welcome to {{serverName}}",
    body: "Hi {{userName}},\n\n{{inviterName}} gave you access to the Minecraft server {{serverName}}. You can now use its console, files, backups and more.",
    buttonLabel: "Open server",
  },
  backupFailed: {
    label: "Backup failed",
    description: "Sent to the server owner when a backup fails.",
    variables: ["userName", "serverName", "backupName", "error", "serverUrl"],
    buttonVar: "serverUrl",
    sample: { userName: "Sam", serverName: "Survival SMP", backupName: "Nightly backup", error: "Storage quota exceeded for this server", serverUrl: "https://panel.example.com/servers/abc123/backups" },
    subject: "Backup of {{serverName}} failed",
    heading: "A backup failed",
    body: "Hi {{userName}},\n\nThe backup \"{{backupName}}\" of {{serverName}} could not be completed.\n\n> {{error}}\n\nYour older backups are not affected.",
    buttonLabel: "View backups",
  },
  test: {
    label: "Test email",
    description: "Sent by the \"Send test email\" button.",
    variables: [],
    buttonVar: null,
    sample: {},
    subject: "Loadstone test email",
    heading: "Your email settings work",
    body: "This is a test email from {{panelName}}. Invitations and notifications will be delivered like this one.",
    buttonLabel: "",
  },
} as const;
export type MailTemplateId = keyof typeof MAIL_TEMPLATES;
export const MAIL_TEMPLATE_IDS = Object.keys(MAIL_TEMPLATES) as MailTemplateId[];

export const templateSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  heading: z.string().trim().max(200).default(""),
  body: z.string().min(1).max(10_000),
  buttonLabel: z.string().trim().max(60).default(""),
});
export type MailTemplate = z.infer<typeof templateSchema>;
export const mailTemplatesSchema = z.object(
  Object.fromEntries(MAIL_TEMPLATE_IDS.map((id) => [id, templateSchema.optional()])) as Record<MailTemplateId, z.ZodOptional<typeof templateSchema>>,
);
export type MailTemplates = Record<MailTemplateId, MailTemplate>;

const defaultsOf = (id: MailTemplateId): MailTemplate => {
  const t = MAIL_TEMPLATES[id];
  return { subject: t.subject, heading: t.heading, body: t.body, buttonLabel: t.buttonLabel };
};

async function read(key: string) {
  return ((await db.setting.findUnique({ where: { key } }))?.value ?? {}) as Record<string, unknown>;
}
async function write(key: string, value: object) {
  await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

export async function getSmtpSettings(): Promise<SmtpSettings> {
  const raw = await read("smtp");
  const password = typeof raw.passwordEncrypted === "string" ? decrypt(raw.passwordEncrypted) : "";
  return smtpSettingsSchema.parse({ ...raw, password });
}

export async function saveSmtpSettings(value: SmtpSettings) {
  const { password, ...rest } = smtpSettingsSchema.parse(value);
  await write("smtp", { ...rest, passwordEncrypted: password ? encrypt(password) : null });
}

/** Saved templates merged over the defaults (templates saved before heading/button existed get the default ones). */
export async function getMailTemplates(): Promise<MailTemplates> {
  const raw = await read("mailTemplates");
  return Object.fromEntries(
    MAIL_TEMPLATE_IDS.map((id) => {
      const saved = raw[id] && typeof raw[id] === "object" ? (raw[id] as Partial<MailTemplate>) : {};
      const defaults = defaultsOf(id);
      return [id, { ...defaults, ...Object.fromEntries(Object.entries(saved).filter(([, v]) => typeof v === "string" && v !== "")) }];
    }),
  ) as MailTemplates;
}

export async function saveMailTemplates(value: z.infer<typeof mailTemplatesSchema>) {
  await write("mailTemplates", mailTemplatesSchema.parse(value));
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const fill = (text: string, vars: Record<string, string>) => text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => vars[k] ?? m);
const linkify = (html: string) => html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#6d4aff;text-decoration:underline">$1</a>');

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Message text → HTML blocks: blank line = new paragraph, lines starting with "> " = highlighted note. */
function bodyHtml(text: string) {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((block) => {
      if (/^>\s?/.test(block)) {
        const inner = linkify(escapeHtml(block.replace(/^>\s?/gm, ""))).replace(/\n/g, "<br>");
        return `<div style="margin:0 0 16px;padding:12px 14px;border-left:3px solid #f59e0b;background:#fff8eb;border-radius:8px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.5;color:#7a4b00">${inner}</div>`;
      }
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#3b3b4a">${linkify(escapeHtml(block)).replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
}

/** Full, email-client-safe HTML (tables + inline styles) with header, heading, message, button and footer. */
function layout(o: { panelName: string; panelUrl: string; heading: string; body: string; buttonLabel: string; buttonUrl: string | null; preheader: string }) {
  const button =
    o.buttonUrl && o.buttonLabel
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 22px"><tr><td style="border-radius:10px;background:#6d4aff;background-image:linear-gradient(135deg,#7c5cff,#5b3df5)">
           <a href="${escapeHtml(o.buttonUrl)}" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">${escapeHtml(o.buttonLabel)}</a>
         </td></tr></table>
         <p style="margin:0 0 4px;font-size:12px;line-height:1.5;color:#8a8a99">Button not working? Copy this link into your browser:</p>
         <p style="margin:0;font-size:12px;line-height:1.5;word-break:break-all"><a href="${escapeHtml(o.buttonUrl)}" style="color:#6d4aff">${escapeHtml(o.buttonUrl)}</a></p>`
      : "";
  const footerLink = o.panelUrl ? ` · <a href="${escapeHtml(o.panelUrl)}" style="color:#8a8a99;text-decoration:underline">${escapeHtml(o.panelUrl.replace(/^https?:\/\//, ""))}</a>` : "";
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(o.heading)}</title></head>
<body style="margin:0;padding:0;background:#f3f1fa;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f1fa"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
    <tr><td style="padding:0 4px 18px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="width:30px;height:30px;border-radius:9px;background:#6d4aff;background-image:linear-gradient(135deg,#8b6cff,#5b3df5);text-align:center;vertical-align:middle;font-family:${FONT};font-size:16px;font-weight:700;color:#ffffff">${escapeHtml(o.panelName.charAt(0).toUpperCase() || "L")}</td>
        <td style="padding-left:10px;font-family:${FONT};font-size:15px;font-weight:600;color:#1f1d2e">${escapeHtml(o.panelName)}</td>
      </tr></table>
    </td></tr>
    <tr><td style="background:#ffffff;border-radius:16px;border:1px solid #e7e4f2;box-shadow:0 1px 2px rgba(31,29,46,0.04),0 8px 24px rgba(31,29,46,0.06);overflow:hidden">
      <div style="height:4px;background:#6d4aff;background-image:linear-gradient(90deg,#7c5cff,#38bdf8)"></div>
      <div style="padding:32px 32px 30px;font-family:${FONT}">
        ${o.heading ? `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.02em;color:#1f1d2e">${escapeHtml(o.heading)}</h1>` : ""}
        ${o.body}
        ${button}
      </div>
    </td></tr>
    <tr><td style="padding:18px 8px 0;text-align:center;font-family:${FONT};font-size:12px;line-height:1.6;color:#8a8a99">
      Sent by ${escapeHtml(o.panelName)}${footerLink}<br>You received this email because of activity on your account.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

/** Fills a template with variables and returns the subject plus HTML and plain-text versions. */
export function renderTemplate(id: MailTemplateId, template: MailTemplate, vars: Record<string, string>, panel: { panelName: string; panelUrl: string }) {
  const all: Record<string, string> = { ...panel, ...vars };
  const def = MAIL_TEMPLATES[id];
  const heading = fill(template.heading, all);
  const body = fill(template.body, all);
  const buttonUrl = def.buttonVar ? (all[def.buttonVar] ?? null) : null;
  const buttonLabel = fill(template.buttonLabel, all);
  const text = [heading, body.replace(/^>\s?/gm, "  "), buttonUrl ? `${buttonLabel || "Open"}: ${buttonUrl}` : "", `— ${panel.panelName}${panel.panelUrl ? ` (${panel.panelUrl})` : ""}`]
    .filter(Boolean)
    .join("\n\n");
  return {
    subject: fill(template.subject, all).replace(/[\r\n]+/g, " "),
    html: layout({ ...panel, heading, body: bodyHtml(body), buttonLabel, buttonUrl, preheader: body.split("\n")[0]!.slice(0, 140) }),
    text,
  };
}

async function panelInfo() {
  const general = await getGeneralSettings();
  return { panelName: general.panelName, panelUrl: (process.env.APP_URL ?? "").replace(/\/$/, "") };
}

/** Renders a (possibly unsaved) template with its sample values, for the settings preview. */
export async function previewTemplate(id: MailTemplateId, template: MailTemplate) {
  return renderTemplate(id, template, MAIL_TEMPLATES[id].sample as Record<string, string>, await panelInfo());
}

function transport(s: SmtpSettings) {
  return nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.security === "tls",
    requireTLS: s.security === "starttls",
    ignoreTLS: s.security === "none",
    auth: s.username ? { user: s.username, pass: s.password } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
  });
}

export async function mailEnabled() {
  const s = await getSmtpSettings();
  return s.enabled && Boolean(s.host && s.fromAddress);
}

/**
 * Renders a template and sends it. Returns false (without throwing) when SMTP isn't configured, so callers can
 * treat email as optional. `smtpOverride` lets the settings page test unsaved settings.
 */
export async function sendTemplate(id: MailTemplateId, to: string, vars: Record<string, string>, smtpOverride?: SmtpSettings) {
  const s = smtpOverride ?? (await getSmtpSettings());
  if (!smtpOverride && (!s.enabled || !s.host || !s.fromAddress)) return false;
  const [templates, panel] = await Promise.all([getMailTemplates(), panelInfo()]);
  const mail = renderTemplate(id, templates[id], vars, panel);
  await transport(s).sendMail({ from: { name: s.fromName || panel.panelName, address: s.fromAddress }, to, ...mail });
  return true;
}
