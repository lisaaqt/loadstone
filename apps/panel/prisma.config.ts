import { loadEnvConfig } from "@next/env";
import { defineConfig } from "prisma/config";

loadEnvConfig(process.cwd());

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // `prisma generate` (typecheck, build, CI) doesn't connect, so it works without DATABASE_URL;
  // commands that need the database fail with a connection error against this placeholder instead.
  datasource: { url: process.env.DATABASE_URL || "postgresql://unset:unset@localhost:5432/set_DATABASE_URL" },
});
