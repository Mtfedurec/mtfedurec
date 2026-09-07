import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, CheckCheck, Eye, EyeOff, Loader2, RefreshCw, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { getValidatedSession } from "@/integrations/supabase/auth-helper";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useMarkAllNotificationsSeen,
  useClearSeenNotifications,
  useMarkAnnouncementSeen,
  useTeacherNotifications,
  type NotificationRow,
} from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notifications")({
  beforeLoad: async () => {
    const session = await getValidatedSession();
    if (!session?.user) throw redirect({ to: "/auth" });
  },
  head: () => ({
    meta: [
      { title: "Notifications — MayDan EduRecord" },
      {
        name: "description",
        content: "View school announcements and notification history.",
      },
      { property: "og:title", content: "Notifications — MayDan EduRecord" },
      {
        property: "og:description",
        content: "School announcements and staff notifications.",
      },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { data: notifications = [], isLoading, refetch } = useTeacherNotifications();
  const markAllSeen = useMarkAllNotificationsSeen();
  const clearSeen = useClearSeenNotifications();
  const markSeen = useMarkAnnouncementSeen();

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => {
      const read = n.announcement_reads?.[0];
      return !read?.seen_at;
    }).length;
  }, [notifications]);

  const seenCount = useMemo(() => {
    return notifications.filter((n) => {
      const read = n.announcement_reads?.[0];
      return !!read?.seen_at;
    }).length;
  }, [notifications]);

  async function handleMarkAllSeen() {
    try {
      await markAllSeen.mutateAsync();
      toast.success("All notifications marked as seen");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update notifications");
    }
  }

  async function handleClearSeen() {
    try {
      await clearSeen.mutateAsync();
      toast.success("Seen notifications cleared");
      void refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to clear notifications");
    }
  }

  async function handleMarkSeen(id: string) {
    try {
      await markSeen.mutateAsync(id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to mark as seen");
    }
  }

  function isNew(row: NotificationRow) {
    const read = row.announcement_reads?.[0];
    return !read?.seen_at;
  }

  function formatDate(value: string | null) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("en-NG", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <AppShell
      title="Notifications"
      description="School announcements and updates"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleMarkAllSeen()}
            disabled={unreadCount === 0 || markAllSeen.isPending}
          >
            <CheckCheck className="mr-2 size-4" />
            Mark all as seen
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleClearSeen()}
            disabled={seenCount === 0 || clearSeen.isPending}
          >
            <Trash2 className="mr-2 size-4" />
            Clear seen
          </Button>

          <Button variant="ghost" size="icon" onClick={() => void refetch()} disabled={isLoading}>
            <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total</p>
          <p className="mt-2 text-2xl font-bold">{notifications.length}</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Unread
          </p>
          <p className="mt-2 text-2xl font-bold text-primary">{unreadCount}</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Seen</p>
          <p className="mt-2 text-2xl font-bold text-muted-foreground">{seenCount}</p>
        </div>
      </div>

      <div className="space-y-3">
        {isLoading && (
          <div className="surface-card flex items-center justify-center gap-3 p-10">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-sm text-muted-foreground">Loading notifications...</span>
          </div>
        )}

        {!isLoading && notifications.length === 0 && (
          <div className="surface-card p-10 text-center">
            <Bell className="mx-auto size-10 text-muted-foreground" />
            <h3 className="mt-4 font-semibold">No notifications</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              You're all caught up. New announcements will appear here.
            </p>
          </div>
        )}

        {notifications.map((row) => {
          const newNotification = isNew(row);
          const priorityColor =
            row.priority === "urgent"
              ? "border-l-4 border-l-destructive"
              : row.priority === "important"
                ? "border-l-4 border-l-primary"
                : "";

          return (
            <div
              key={row.id}
              className={cn(
                "surface-card p-5 transition-colors",
                !newNotification && "bg-secondary/20",
                priorityColor,
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{row.title}</h3>

                    <Badge
                      variant={
                        row.priority === "urgent"
                          ? "destructive"
                          : row.priority === "important"
                            ? "default"
                            : "secondary"
                      }
                    >
                      {row.priority}
                    </Badge>

                    {newNotification && <Badge className="bg-primary/15 text-primary">NEW</Badge>}
                  </div>

                  <p className="mt-2 text-sm text-muted-foreground">{row.message}</p>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{formatDate(row.published_at)}</span>
                    {row.expires_at && <span>Expires: {formatDate(row.expires_at)}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {newNotification ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleMarkSeen(row.id)}
                      disabled={markSeen.isPending}
                    >
                      <Eye className="mr-2 size-4" />
                      Mark as seen
                    </Button>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <EyeOff className="size-4" />
                      Seen
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
