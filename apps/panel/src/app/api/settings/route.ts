import { z } from "zod";
import { handler, parseBody } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import {
  generalSettingsSchema,
  getGeneralSettings,
  getSftpSettings,
  getStorageSettings,
  saveGeneralSettings,
  saveSftpSettings,
  saveStorageSettings,
  sftpSettingsSchema,
  storageSettingsSchema,
} from "@/lib/settings";

const MASK = "••••••••";
const mask = (value: string) => (value ? MASK : "");
const keep = (input: string, current: string) => (input === MASK ? current : input);

export const GET = handler(
  async () => {
    const [general, storage, sftp] = await Promise.all([getGeneralSettings(), getStorageSettings(), getSftpSettings()]);
    return {
      general,
      storage: { ...storage, secretAccessKey: mask(storage.secretAccessKey) },
      sftp: { ...sftp, password: mask(sftp.password), privateKey: mask(sftp.privateKey), passphrase: mask(sftp.passphrase) },
    };
  },
  { admin: true },
);

const schema = z.object({
  general: generalSettingsSchema.optional(),
  storage: storageSettingsSchema.optional(),
  sftp: sftpSettingsSchema.optional(),
});

export const PUT = handler(
  async ({ req, user, ip }) => {
    const input = await parseBody(req, schema);
    if (input.general) await saveGeneralSettings(input.general);
    if (input.storage) {
      const current = await getStorageSettings();
      await saveStorageSettings({ ...input.storage, secretAccessKey: keep(input.storage.secretAccessKey, current.secretAccessKey) });
    }
    if (input.sftp) {
      const current = await getSftpSettings();
      await saveSftpSettings({
        ...input.sftp,
        password: keep(input.sftp.password, current.password),
        privateKey: keep(input.sftp.privateKey, current.privateKey),
        passphrase: keep(input.sftp.passphrase, current.passphrase),
      });
    }
    await logActivity({ action: "settings.update", message: `Updated ${Object.keys(input).join(" & ")} settings`, userId: user.id, ip });
    return { ok: true };
  },
  { admin: true },
);
