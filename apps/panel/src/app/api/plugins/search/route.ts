import { z } from "zod";
import { SOFTWARE_IDS } from "@loadstone/shared";
import { handler, parseQuery } from "@/lib/api";
import { listVersions, searchAddons } from "@/lib/addons";

const schema = z.object({
  source: z.enum(["MODRINTH", "HANGAR"]).default("MODRINTH"),
  software: z.enum(SOFTWARE_IDS).default("PAPER"),
  q: z.string().max(100).default(""),
  version: z.string().max(32).optional(),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
  project: z.string().max(80).optional(),
});

export const GET = handler(async ({ req }) => {
  const input = parseQuery(req, schema);
  if (input.project) {
    const versions = await listVersions({
      source: input.source,
      projectId: input.project,
      software: input.software,
      gameVersion: input.version,
    });
    return { versions };
  }
  return searchAddons({ source: input.source, software: input.software, query: input.q, gameVersion: input.version, offset: input.offset });
});
