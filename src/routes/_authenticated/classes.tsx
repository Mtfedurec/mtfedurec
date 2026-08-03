import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { logAudit, useClasses, useSubjects } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/classes")({
  head: () => ({
    meta: [
      { title: "Classes & subjects — MayDan EduRecord" },
      {
        name: "description",
        content: "Create classes, register subjects and organise the school's academic structure.",
      },
      { property: "og:title", content: "Classes & subjects — MayDan EduRecord" },
      { property: "og:description", content: "Academic structure setup for the school." },
    ],
  }),
  component: ClassesPage,
});

function ClassesPage() {
  const { data: classes = [] } = useClasses();
  const { data: subjects = [] } = useSubjects();
  const queryClient = useQueryClient();
  const [cls, setCls] = useState({ name: "", level: "", section: "" });
  const [subject, setSubject] = useState({ name: "", code: "" });

  async function addClass(event: React.FormEvent) {
    event.preventDefault();
    const { error } = await supabase.from("classes").insert({
      name: cls.name,
      level: cls.level || null,
      section: cls.section || null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Class created");
    void logAudit("class.created", cls.name);
    setCls({ name: "", level: "", section: "" });
    void queryClient.invalidateQueries({ queryKey: ["classes"] });
  }

  async function addSubject(event: React.FormEvent) {
    event.preventDefault();
    const { error } = await supabase
      .from("subjects")
      .insert({ name: subject.name, code: subject.code || null });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Subject created");
    void logAudit("subject.created", subject.name);
    setSubject({ name: "", code: "" });
    void queryClient.invalidateQueries({ queryKey: ["subjects"] });
  }

  return (
    <AppShell title="Classes & subjects" description="Academic structure">
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="surface-card p-4">
          <h2 className="text-base font-semibold">Classes</h2>
          <form onSubmit={addClass} className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-3">
              <Label htmlFor="cname">Class name</Label>
              <Input
                id="cname"
                required
                placeholder="JSS 1A"
                value={cls.name}
                onChange={(e) => setCls({ ...cls, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clevel">Level</Label>
              <Input
                id="clevel"
                placeholder="JSS 1"
                value={cls.level}
                onChange={(e) => setCls({ ...cls, level: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="csection">Section</Label>
              <Input
                id="csection"
                placeholder="A"
                value={cls.section}
                onChange={(e) => setCls({ ...cls, section: e.target.value })}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full">
                Add class
              </Button>
            </div>
          </form>
          <ul className="mt-4 divide-y divide-border text-sm">
            {classes.map((c) => {
              const item = c as { id: string; name: string; level: string | null };
              return (
                <li key={item.id} className="flex justify-between py-2">
                  <span className="font-medium">{item.name}</span>
                  <span className="text-muted-foreground">{item.level ?? "—"}</span>
                </li>
              );
            })}
            {classes.length === 0 && <li className="py-2 text-muted-foreground">No classes yet.</li>}
          </ul>
        </section>

        <section className="surface-card p-4">
          <h2 className="text-base font-semibold">Subjects</h2>
          <form onSubmit={addSubject} className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="sname">Subject name</Label>
              <Input
                id="sname"
                required
                placeholder="Mathematics"
                value={subject.name}
                onChange={(e) => setSubject({ ...subject, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="scode">Code</Label>
              <Input
                id="scode"
                placeholder="MTH"
                value={subject.code}
                onChange={(e) => setSubject({ ...subject, code: e.target.value })}
              />
            </div>
            <div className="flex items-end sm:col-span-3">
              <Button type="submit">Add subject</Button>
            </div>
          </form>
          <ul className="mt-4 divide-y divide-border text-sm">
            {subjects.map((s) => {
              const item = s as { id: string; name: string; code: string | null };
              return (
                <li key={item.id} className="flex justify-between py-2">
                  <span className="font-medium">{item.name}</span>
                  <span className="text-muted-foreground">{item.code ?? "—"}</span>
                </li>
              );
            })}
            {subjects.length === 0 && (
              <li className="py-2 text-muted-foreground">No subjects yet.</li>
            )}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}