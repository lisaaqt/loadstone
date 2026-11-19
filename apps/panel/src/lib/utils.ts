import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function usageTone(pct: number): "primary" | "warning" | "danger" {
  return pct >= 90 ? "danger" : pct >= 75 ? "warning" : "primary";
}
