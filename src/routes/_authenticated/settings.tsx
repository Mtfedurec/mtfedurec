import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getSessionSafely } from "@/integrations/supabase/auth-helper";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  logAudit,
  useComponents,
  useGradeScale,
  useProfile,
  useSchool,
  useStaff,
  useTerms,
} from "@/lib/data";

export const Route = createFileRoute("/_authenticated/settings")({
  beforeLoad: async () => {
    const session = await getSessionSafely();
    if (!session?.user) throw redirect({ to: "/auth" });

    const { data: roles, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id);

    if (error) throw error;

    const isAdmin = (roles ?? []).some((row) => row.role === "admin");
    if (!isAdmin) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Settings — MayDan EduRecord" },
      {
        name: "description",
        content: "School profile, terms, grade scale, assessment components and staff roles.",
      },
      { property: "og:title", content: "Settings — MayDan EduRecord" },
      { property: "og:description", content: "School configuration and staff role management." },
    ],
  }),
  component: SettingsPage,
});

const ROLES = ["admin", "head_teacher", "teacher"] as const;
type AppRole = (typeof ROLES)[number];

function SettingsPage() {
  const { data: school } = useSchool();
  const { data: profile } = useProfile();
  const { data: staff = [] } = useStaff();
  const { data: terms = [] } = useTerms();
  const { data: components = [] } = useComponents();
  const { data: bands = [] } = useGradeScale();
  const queryClient = useQueryClient();
  const isAdmin = Boolean(profile?.roles.includes("admin"));
  const [form, setForm] = useState({ name: "", motto: "", address: "", phone: "", email: "" });

  useEffect(() => {
    if (!school) return;
    const s = school as Record<string, string | null>;
    setForm({
      name: s['name'] ?? "",
      motto: s['motto'] ?? "",
      address: s['address'] ?? "",
      phone: s['phone'] ?? "",
      email: s['email'] ?? "",
    });
  }, [school]);

  async function saveSchool(event: React.FormEvent) {
    event.preventDefault();
    const id = (school as { id?: string } | null)?.id;
    const { error } = id
      ? await supabase.from("school_settings").update(form).eq("id", id)
      : await supabase.from("school_settings").insert(form);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("School profile saved");
    void logAudit("school.updated", form.name);
    void queryClient.invalidateQueries({ queryKey: ["school"] });
  }

  async function setRole(userId: string, role: AppRole) {
    const { error: deleteError } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId);

    if (deleteError) {
      toast.error(deleteError.message);
      return;
    }

    const { error: insertError } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, role });

    if (insertError) {
      toast.error(insertError.message);
      return;
    }

    toast.success("Role updated");
    void logAudit("role.changed", userId, role);
    void queryClient.invalidateQueries({ queryKey: ["staff"] });
    void queryClient.invalidateQueries({ queryKey: ["me"] });
  }

  async function setCurrentTerm(termId: string) {
    await supabase.from("terms").update({ is_current: false }).neq("id", termId);
    const { error } = await supabase.from("terms").update({ is_current: true }).eq("id", termId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Current term updated");
    void queryClient.invalidateQueries({ queryKey: ["terms"] });
  }

  return (
    <AppShell title="Settings" description="School configuration">
      <form onSubmit={saveSchool} className="surface-card grid gap-4 p-4 sm:grid-cols-2">
        <h2 className="text-base font-semibold sm:col-span-2">School profile</h2>
        {(
          [
            ["name", "School name"],
            ["motto", "Motto"],
            ["address", "Address"],
            ["phone", "Phone"],
            ["email", "Email"],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="space-y-2">
            <Label htmlFor={key}>{label}</Label>
            <Input
              id={key}
              disabled={!isAdmin}
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            />
          </div>
        ))}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={!isAdmin}>
            Save school profile
          </Button>
        </div>
      </form>

      <section className="surface-card p-4">
        <h2 className="text-base font-semibold">Terms</h2>
        <ul className="mt-3 divide-y divide-border text-sm">
          {terms.map((t) => {
            const term = t as {
              id: string;
              name: string;
              is_current: boolean;
              academic_sessions?: { name: string } | null;
            };
            return (
              <li key={term.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{term.name}</span>{" "}
                  <span className="text-muted-foreground">
                    {term.academic_sessions?.name ?? ""}
                  </span>
                </span>
                {term.is_current ? (
                  <span className="rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success">
                    Current
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!isAdmin}
                    onClick={() => void setCurrentTerm(term.id)}
                  >
                    Set current
                  </Button>
                )}
              </li>
            );
          })}
          {terms.length === 0 && <li className="py-2 text-muted-foreground">No terms defined.</li>}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="surface-card p-4">
          <h2 className="text-base font-semibold">Assessment components</h2>
          <ul className="mt-3 divide-y divide-border text-sm">
            {components.map((c) => {
              const comp = c as { id: string; name: string; max_score: number };
              return (
                <li key={comp.id} className="flex justify-between py-2">
                  <span className="font-medium">{comp.name}</span>
                  <span className="text-muted-foreground">max {comp.max_score}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="surface-card p-4">
          <h2 className="text-base font-semibold">Grade scale</h2>
          <ul className="mt-3 divide-y divide-border text-sm">
            {bands.map((b) => {
              const band = b as {
                id: string;
                grade: string;
                min_score: number;
                max_score: number;
                remark: string;
              };
              return (
                <li key={band.id} className="flex justify-between py-2">
                  <span className="font-medium">
                    {band.grade} · {band.min_score}–{band.max_score}
                  </span>
                  <span className="text-muted-foreground">{band.remark}</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section className="surface-card p-4">
        <h2 className="text-base font-semibold">Staff & roles</h2>
        {!isAdmin && (
          <p className="mt-2 text-sm text-muted-foreground">
            Only administrators can change role assignments.
          </p>
        )}
        <ul className="mt-3 divide-y divide-border">
          {staff.map((member) => (
            <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{member.full_name}</p>
                <p className="truncate text-xs text-muted-foreground">{member.email}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {ROLES.map((role) => {
                  const has = member.roles.includes(role);
                  return (
                    <Button
                      key={role}
                      size="sm"
                      variant={has ? "default" : "outline"}
                      disabled={!isAdmin}
                      onClick={() => void setRole(member.id, role)}
                    >
                      {role.replace("_", " ")}
                    </Button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}