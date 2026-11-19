import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex size-6 shrink-0 items-center justify-center rounded-[28%] bg-[linear-gradient(135deg,#a68cff_0%,#7a52f7_50%,#5631dc_100%)] shadow-[inset_0_1px_0_rgb(255_255_255/0.35),inset_0_0_0_1px_rgb(255_255_255/0.12),0_4px_14px_-4px_rgb(109_66_245/0.55)]",
        className,
      )}
    >
      <svg viewBox="0 0 32 32" fill="none" className="size-full">
        <path d="M16 7 23.5 11.25v9.5L16 25l-7.5-4.25v-9.5L16 7Z" stroke="#fff" strokeOpacity="0.95" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M16 12.6 19.2 14.4v3.2L16 19.4l-3.2-1.8v-3.2L16 12.6Z" fill="#fff" />
      </svg>
    </span>
  );
}
