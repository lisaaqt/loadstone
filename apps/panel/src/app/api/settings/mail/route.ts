import { z } from "zod";
import { handler, parseBody } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { getMailTemplates, getSmtpSettings, MAIL_TEMPLATES, mailTemplatesSchema, saveMailTemplates, saveSmtpSettings, smtpSettingsSchema } from "@/lib/mail";

const MASK = "••••••••";

export const GET = handler(
  async () => {
    const [smtp, templates] = await Promise.all([getSmtpSettings(), getMailTemplates()]);
    const definitions = Object.fromEntries(
      Object.entries(MAIL_TEMPLATES).map(([id, t]) => [
        id,
        {
          label: t.label,
          description: t.description,
          variables: t.variables,
          hasButton: t.buttonVar !== null,
          subject: t.subject,
          heading: t.heading,
          body: t.body,
          buttonLabel: t.buttonLabel,
        },
      ]),
    );
    return { smtp: { ...smtp, password: smtp.password ? MASK : "" }, templates, definitions };
  },
  { admin: true },
);

export const PUT = handler(
  async ({ req, user, ip }) => {
    const input = await parseBody(req, z.object({ smtp: smtpSettingsSchema.optional(), templates: mailTemplatesSchema.optional() }));
    if (input.smtp) {
      const current = await getSmtpSettings();
      await saveSmtpSettings({ ...input.smtp, password: input.smtp.password === MASK ? current.password : input.smtp.password });
    }
    if (input.templates) await saveMailTemplates(input.templates);
    await logActivity({ action: "settings.update", message: `Updated email ${Object.keys(input).join(" & ")}`, userId: user.id, ip });
    return { ok: true };
  },
  { admin: true },
);
