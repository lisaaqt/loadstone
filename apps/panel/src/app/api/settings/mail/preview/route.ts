import { z } from "zod";
import { handler, parseBody } from "@/lib/api";
import { MAIL_TEMPLATE_IDS, previewTemplate, templateSchema } from "@/lib/mail";

/** Renders a template (as currently typed in the form) with sample values. */
export const POST = handler(
  async ({ req }) => {
    const { id, template } = await parseBody(req, z.object({ id: z.enum(MAIL_TEMPLATE_IDS as [string, ...string[]]), template: templateSchema }));
    return previewTemplate(id as (typeof MAIL_TEMPLATE_IDS)[number], template);
  },
  { admin: true },
);
