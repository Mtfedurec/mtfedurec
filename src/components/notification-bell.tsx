import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Link } from "@tanstack/react-router";
import { useUnreadNotificationCount, useTeacherNotifications } from "@/lib/data";
import { cn } from "@/lib/utils";

type Priority = "normal" | "important" | "urgent";

type NotificationRow = {
  id: string;
  title: string;
  message: string;
  priority: Priority;
  published_at: string;
  expires_at: string | null;
  announcement_reads?: { seen_at: string | null; cleared_at: string | null }[] | null;
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data: unreadCount = 0 } = useUnreadNotificationCount();
  const { data: notifications = [], isLoading } = useTeacherNotifications();

  const recent = notifications.slice(0, 5) as NotificationRow[];

  function formatRelative(value: string) {
    const date = new Date(value);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          <Link
            to="/notifications"
            className="text-xs font-medium text-primary hover:underline"
            onClick={() => setOpen(false)}
          >
            View all
          </Link>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
              <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Loading...
            </div>
          )}

          {!isLoading && recent.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">No notifications</div>
          )}

          {recent.map((row) => {
            const read = row.announcement_reads?.[0];
            const isNew = !read?.seen_at;

            return (
              <div
                key={row.id}
                className={cn(
                  "border-b border-border px-4 py-3 last:border-b-0",
                  !isNew && "bg-secondary/20",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{row.title}</p>
                      {isNew && (
                        <span className="mt-0.5 inline-flex size-2 rounded-full bg-primary" />
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{row.message}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {formatRelative(row.published_at)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {recent.length > 0 && (
          <div className="border-t border-border px-4 py-2 text-center">
            <Link
              to="/notifications"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => setOpen(false)}
            >
              View all notifications
            </Link>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
