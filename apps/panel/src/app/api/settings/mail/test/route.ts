import { z } from "zod";
import { ApiError, handler, parseBody } from "@/lib/api";
import { getSmtpSettings, sendTemplate, smtpSettingsSchema } from "@/lib/mail";
import { emailSchema } from "@/lib/validation";

/** Sends the test template using the (possibly unsaved) settings from the form. */
export const POST = handler(
  async ({ req }) => {
    const { to, smtp } = await parseBody(req, z.object({ to: emailSchema, smtp: smtpSettingsSchema }));
    const current = await getSmtpSettings();
    const settings = { ...smtp, password: smtp.password === "••••••••" ? current.password : smtp.password };
    if (!settings.host || !settings.fromAddress) throw new ApiError(422, "Enter the SMTP host and a sender address first");
    try {
      await sendTemplate("test", to, {}, settings);
    } catch (err) {
      throw new ApiError(502, `Sending failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return { ok: true };
  },
  { admin: true, rateLimit: { limit: 10, windowSeconds: 300, bucket: "mail-test" } },
);
