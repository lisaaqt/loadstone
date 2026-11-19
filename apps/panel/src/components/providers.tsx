"use client";

import { ThemeProvider, useTheme } from "next-themes";
import { CircleCheck, CircleX, Info, LoaderCircle, TriangleAlert } from "lucide-react";
import { Toaster } from "sonner";
import { SWRConfig } from "swr";
import { TooltipProvider } from "@/components/ui/misc";
import { fetcher } from "@/lib/client";

const toastIcon = (Icon: typeof Info, tone: string, spin = false) => (
  <span className={`icon-tile size-7 rounded-lg ${tone}`}>
    <Icon className={`size-4 ${spin ? "animate-spin" : ""}`} />
  </span>
);

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      theme={resolvedTheme === "light" ? "light" : "dark"}
      position="bottom-right"
      gap={10}
      offset={20}
      closeButton
      icons={{
        success: toastIcon(CircleCheck, "text-success"),
        error: toastIcon(CircleX, "text-danger"),
        warning: toastIcon(TriangleAlert, "text-warning"),
        info: toastIcon(Info, "text-info"),
        loading: toastIcon(LoaderCircle, "text-primary dark:text-primary-strong", true),
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "group/toast relative flex w-[356px] items-start gap-3 overflow-hidden rounded-2xl border border-border-strong bg-surface/95 p-3.5 pr-9 text-[13px] text-foreground shadow-pop backdrop-blur-xl dark:bg-surface-2/95 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-transparent",
          success: "before:!bg-success",
          error: "before:!bg-danger",
          warning: "before:!bg-warning",
          info: "before:!bg-info",
          loading: "before:!bg-primary",
          icon: "mt-px shrink-0",
          content: "flex min-w-0 flex-1 flex-col gap-0.5 pt-1",
          title: "font-semibold leading-snug tracking-[-0.01em]",
          description: "text-xs leading-relaxed text-muted [overflow-wrap:anywhere]",
          closeButton:
            "!absolute !left-auto !right-2.5 !top-2.5 !size-5 !translate-x-0 !translate-y-0 !rounded-md !border-0 !bg-transparent !text-subtle opacity-0 transition-opacity hover:!bg-foreground/[0.06] hover:!text-foreground group-hover/toast:opacity-100",
          actionButton:
            "ml-auto shrink-0 self-center rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary-hover",
          cancelButton: "ml-auto shrink-0 self-center rounded-lg px-2.5 py-1 text-xs font-medium text-muted hover:bg-foreground/[0.05]",
        },
      }}
    />
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <SWRConfig value={{ fetcher, revalidateOnFocus: true, shouldRetryOnError: false }}>
        <TooltipProvider delayDuration={250}>
          {children}
          <ThemedToaster />
        </TooltipProvider>
      </SWRConfig>
    </ThemeProvider>
  );
}
