"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { cn } from "@/lib/utils";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";

const SidebarContext = createContext<{ collapsed: boolean; toggle: () => void }>({ collapsed: false, toggle: () => undefined });

export function useSidebar() {
  return useContext(SidebarContext);
}

export function SidebarProvider({ initialCollapsed, children }: { initialCollapsed: boolean; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const toggle = useCallback(() => {
    setCollapsed((value) => {
      const next = !value;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);
  return <SidebarContext.Provider value={{ collapsed, toggle }}>{children}</SidebarContext.Provider>;
}

/** Content column next to the floating sidebar; its left offset follows the collapsed state. */
export function SidebarInset({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <div className={cn("transition-[padding] duration-300 ease-out", collapsed ? "md:pl-[92px]" : "md:pl-[264px]")}>{children}</div>
  );
}
