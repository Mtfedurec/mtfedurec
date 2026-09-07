import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bell,
  CheckCircle2,
  Clock3,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { getValidatedSession, userHasAnyRole } from "@/integrations/supabase/auth-helper";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  logAudit,
  useAnnouncements,
  useCreateAnnouncement,
  useUpdateAnnouncement,
} from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/announcements")({
  beforeLoad: async () => {
    const session = await getValidatedSession();
    if (!session?.user) throw redirect({ to: "/auth" });

    if (!(await userHasAnyRole(session.user.id, ["admin"]))) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({
    meta: [
      { title: "Announcements — MayDan EduRecord" },
      {
        name: "description",
        content: "Create and manage school announcements and notifications for staff.",
      },
      { property: "og:title", content: "Announcements — MayDan EduRecord" },
      { property: "og:description", content: "School announcement management." },
    ],
  }),
  component: AnnouncementsPage,
});

type Priority = "normal" | "important" | "urgent";

type AnnouncementRow = {
  id: string;
  title: string;
  message: string;
  priority: Priority;
  is_published: boolean;
  published_at: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  announcement_reads?: { count: number }[] | null;
};

function AnnouncementsPage() {
  const { data: announcements = [], isLoading } = useAnnouncements();
  const createAnnouncement = useCreateAnnouncement();
  const updateAnnouncement = useUpdateAnnouncement();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AnnouncementRow | null>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [isPublished, setIsPublished] = useState(true);
  const [expiresAt, setExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditing(null);
    setTitle("");
    setMessage("");
    setPriority("normal");
    setIsPublished(true);
    setExpiresAt("");
    setDialogOpen(true);
  }

  function openEdit(row: AnnouncementRow) {
    setEditing(row);
    setTitle(row.title);
    setMessage(row.message);
    setPriority(row.priority);
    setIsPublished(row.is_published);
    setExpiresAt(row.expires_at ? row.expires_at.slice(0, 16) : "");
    setDialogOpen(true);
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);

    try {
      if (editing) {
        await updateAnnouncement.mutateAsync({
          id: editing.id,
          title,
          message,
          priority,
          is_published: isPublished,
          expires_at: expiresAt || null,
        });
        toast.success("Announcement updated");
        void logAudit("announcement.updated", editing.id, title);
      } else {
        await createAnnouncement.mutateAsync({
          title,
          message,
          priority,
          is_published: isPublished,
          expires_at: expiresAt || null,
        });
        toast.success("Announcement created");
        void logAudit("announcement.created", title);
      }

      setDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save announcement");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("announcements").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Announcement deleted");
    void logAudit("announcement.deleted", id);
    void queryClient.invalidateQueries({ queryKey: ["announcements"] });
  }

  function isExpired(row: AnnouncementRow) {
    if (!row.expires_at) return false;
    return new Date(row.expires_at) <= new Date();
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

  const totalActive = announcements.filter((a) => !isExpired(a)).length;
  const totalExpired = announcements.filter((a) => isExpired(a)).length;

  return (
    <AppShell title="Announcements" description="Manage school notifications for staff">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Announcement history</h2>
          <p className="text-sm text-muted-foreground">
            {totalActive} active · {totalExpired} expired · {announcements.length} total
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>
              <Plus className="mr-2 size-4" />
              New announcement
            </Button>
          </DialogTrigger>

          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit announcement" : "New announcement"}</DialogTitle>
              <DialogDescription>
                {editing
                  ? "Update the announcement details below."
                  : "Create a new announcement for all staff members."}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="announcement-title">Title</Label>
                <Input
                  id="announcement-title"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Staff meeting tomorrow"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="announcement-message">Message</Label>
                <textarea
                  id="announcement-message"
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Enter the announcement content..."
                  className="h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="announcement-priority">Priority</Label>
                  <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                    <SelectTrigger id="announcement-priority">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="important">Important</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="announcement-expiry">Expiry date/time (optional)</Label>
                  <Input
                    id="announcement-expiry"
                    type="datetime-local"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="announcement-published"
                  type="checkbox"
                  checked={isPublished}
                  onChange={(e) => setIsPublished(e.target.checked)}
                  className="size-4 rounded border-input"
                />
                <Label htmlFor="announcement-published" className="text-sm font-normal">
                  Published (visible to staff)
                </Label>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                  {editing ? "Save changes" : "Publish announcement"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {isLoading && (
          <div className="surface-card flex items-center justify-center gap-3 p-10">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-sm text-muted-foreground">Loading announcements...</span>
          </div>
        )}

        {!isLoading && announcements.length === 0 && (
          <div className="surface-card p-10 text-center">
            <Bell className="mx-auto size-10 text-muted-foreground" />
            <h3 className="mt-4 font-semibold">No announcements yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first announcement to communicate with staff.
            </p>
          </div>
        )}

        {announcements.map((row) => {
          const expired = isExpired(row);
          const seenCount =
            (row.announcement_reads as { count: number }[] | null | undefined)?.reduce(
              (sum, r) => sum + (r.count ?? 0),
              0,
            ) ?? 0;

          return (
            <div key={row.id} className={cn("surface-card p-5", expired && "opacity-75")}>
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

                    {expired && (
                      <Badge variant="outline" className="text-muted-foreground">
                        Expired
                      </Badge>
                    )}

                    {!row.is_published && (
                      <Badge variant="outline" className="text-muted-foreground">
                        Draft
                      </Badge>
                    )}
                  </div>

                  <p className="mt-2 text-sm text-muted-foreground">{row.message}</p>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Published: {formatDate(row.published_at)}</span>
                    {row.expires_at && <span>Expires: {formatDate(row.expires_at)}</span>}
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="size-3.5" />
                      {seenCount} seen
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(row)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (window.confirm("Delete this announcement?")) {
                        void handleDelete(row.id);
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
