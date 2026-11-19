import { Box, Container, Feather, FlaskConical, Hammer, Layers, Network, Scroll, Sparkles, Wrench, Zap, type LucideIcon } from "lucide-react";
import type { SoftwareId } from "@loadstone/shared";
import { cn } from "@/lib/utils";

const ICONS: Record<SoftwareId, { icon: LucideIcon; color: string }> = {
  VANILLA: { icon: Box, color: "text-emerald-600 dark:text-emerald-400" },
  PAPER: { icon: Scroll, color: "text-sky-600 dark:text-sky-400" },
  PURPUR: { icon: Sparkles, color: "text-fuchsia-600 dark:text-fuchsia-400" },
  SPIGOT: { icon: Zap, color: "text-amber-600 dark:text-amber-400" },
  FOLIA: { icon: Layers, color: "text-lime-600 dark:text-lime-400" },
  FABRIC: { icon: Feather, color: "text-orange-500 dark:text-orange-300" },
  QUILT: { icon: FlaskConical, color: "text-violet-600 dark:text-violet-400" },
  FORGE: { icon: Hammer, color: "text-zinc-600 dark:text-zinc-400" },
  NEOFORGE: { icon: Wrench, color: "text-orange-600 dark:text-orange-400" },
  VELOCITY: { icon: Network, color: "text-cyan-600 dark:text-cyan-400" },
  BUNGEECORD: { icon: Network, color: "text-amber-600 dark:text-amber-400" },
  WATERFALL: { icon: Network, color: "text-sky-600 dark:text-sky-400" },
  CUSTOM: { icon: Container, color: "text-blue-600 dark:text-blue-400" },
};

export function SoftwareIcon({ software, className }: { software: SoftwareId; className?: string }) {
  const { icon: Icon, color } = ICONS[software];
  return <Icon className={cn("size-3.5 shrink-0", color, className)} />;
}

export function SoftwareTile({ software, size = "md", className }: { software: SoftwareId; size?: "sm" | "md" | "lg"; className?: string }) {
  const { icon: Icon, color } = ICONS[software];
  const dims = { sm: "size-8 rounded-lg [&_svg]:size-4", md: "size-10 rounded-xl [&_svg]:size-[18px]", lg: "size-14 rounded-2xl [&_svg]:size-6" }[size];
  return (
    <span className={cn("icon-tile relative", dims, color, className)}>
      <Icon />
    </span>
  );
}
