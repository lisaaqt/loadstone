"use client";

import { useEffect, useState } from "react";
import useSWRInfinite from "swr/infinite";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { ActivityList, type ActivityItem } from "./activity-list";

interface Page {
  items: ActivityItem[];
  nextCursor: string | null;
}

export function ActivityFeed({ serverId }: { serverId?: string }) {
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data, size, setSize, isLoading, isValidating } = useSWRInfinite<Page>((index, prev) => {
    if (prev && !prev.nextCursor) return null;
    const params = new URLSearchParams({ limit: "50" });
    if (serverId) params.set("serverId", serverId);
    if (q) params.set("q", q);
    if (prev?.nextCursor) params.set("cursor", prev.nextCursor);
    return `/api/activity?${params}`;
  });
  const items = data?.flatMap((p) => p.items) ?? [];
  const hasMore = !!data?.[data.length - 1]?.nextCursor;

  return (
    <Card>
      <div className="border-b border-border p-3">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search activity…" className="pl-8" />
        </div>
      </div>
      {isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : (
        <ActivityList items={items} />
      )}
      {hasMore && (
        <div className="border-t border-border p-3 text-center">
          <Button variant="ghost" size="sm" loading={isValidating} onClick={() => void setSize(size + 1)}>
            Load more
          </Button>
        </div>
      )}
    </Card>
  );
}
