import { cn } from "@/lib/utils";

export function PageContainer({ children, className, wide }: { children: React.ReactNode; className?: string; wide?: boolean }) {
  return (
    <div className={cn("mx-auto w-full animate-slide-up px-5 py-8 md:px-8 md:py-10", wide ? "max-w-[1440px]" : "max-w-[1200px]", className)}>{children}</div>
  );
}
