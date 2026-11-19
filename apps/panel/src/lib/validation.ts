import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);
export const passwordSchema = z.string().min(10, "Password must be at least 10 characters").max(256);
export const nameSchema = z.string().trim().min(1, "Name is required").max(64);
export const idSchema = z.string().regex(/^[a-z0-9]{8,40}$/, "Invalid id");

export const cronSchema = z
  .string()
  .trim()
  .regex(/^(\S+\s+){4}\S+$/, "Cron expressions must have 5 fields (minute hour day month weekday)");

export const minecraftNameSchema = z.string().regex(/^[A-Za-z0-9_]{1,16}$/, "Invalid Minecraft username");
