import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getValidatedSession, userHasAnyRole } from "@/integrations/supabase/auth-helper";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { logAudit, useClasses, useStudents } from "@/lib/data";
import {
  downloadStudentImportTemplate,
  parseStudentImportFile,
  type StudentImportPreview,
} from "@/lib/student-import";

export const Route = createFileRoute("/_authenticated/students")({
  beforeLoad: async () => {
    const session = await getValidatedSession();
    if (!session?.user) throw redirect({ to: "/auth" });

    if (!(await userHasAnyRole(session.user.id, ["admin"]))) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({
    meta: [
      { title: "Students — MayDan EduRecord" },
      {
        name: "description",
        content: "Admission records, class placement and guardian details for every student.",
      },
      { property: "og:title", content: "Students — MayDan EduRecord" },
      { property: "og:description", content: "Student admission and class placement records." },
    ],
  }),
  component: StudentsPage,
});

function StudentsPage() {
  const { data: classes = [] } = useClasses();
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const { data: students = [] } = useStudents(filter || undefined);
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    full_name: "",
    admission_number: "",
    gender: "female",
    class_id: "",
    guardian_name: "",
    guardian_phone: "",
  });
  const [busy, setBusy] = useState(false);

  // Import dialog state
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [photoArchiveFile, setPhotoArchiveFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<StudentImportPreview | null>(null);
  const [importStep, setImportStep] = useState<"upload" | "preview" | "importing">("upload");
  const [importBusy, setImportBusy] = useState(false);

  const visible = students.filter((s) =>
    (s as { full_name: string }).full_name.toLowerCase().includes(search.toLowerCase()),
  );

  async function addStudent(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("students").insert({
      ...form,
      class_id: form.class_id || null,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Student admitted");
    void logAudit("student.created", form.admission_number, form.full_name);
    setForm({
      full_name: "",
      admission_number: "",
      gender: "female",
      class_id: "",
      guardian_name: "",
      guardian_phone: "",
    });
    void queryClient.invalidateQueries({ queryKey: ["students"] });
  }

  async function handleImportFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setImportFile(file);
  }

  async function handlePhotoArchiveChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setPhotoArchiveFile(file);
  }

  async function validateImportFile() {
    if (!importFile) {
      toast.error("Please select a spreadsheet file.");
      return;
    }

    try {
      setImportBusy(true);
      const existingIds = new Set<string>(
        (students as { admission_number: string }[]).map((s) =>
          String(s.admission_number).toLowerCase(),
        ),
      );

      const preview = await parseStudentImportFile(
        importFile,
        (classes as { id: string; name: string }[]).map((c) => ({
          id: String(c.id),
          name: String((c as { name: string }).name),
        })),
        existingIds,
        photoArchiveFile || undefined,
      );

      setImportPreview(preview);
      setImportStep("preview");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to parse spreadsheet.");
    } finally {
      setImportBusy(false);
    }
  }

  async function confirmImport() {
    if (!importPreview || !importPreview.validRows.length) {
      toast.error("No valid rows to import.");
      return;
    }

    try {
      setImportBusy(true);
      setImportStep("importing");

      const { error } = await supabase.from("students").insert(importPreview.validRows);

      if (error) {
        toast.error(`Import failed: ${error.message}`);
        setImportStep("preview");
        return;
      }

      toast.success(
        `Imported ${importPreview.summary.valid} students. ${importPreview.summary.matchedPhoto} photos matched.`,
      );
      void logAudit("student.bulk_imported", String(importPreview.summary.valid), "students");

      // Reset import dialog
      setShowImportDialog(false);
      setImportFile(null);
      setPhotoArchiveFile(null);
      setImportPreview(null);
      setImportStep("upload");
      void queryClient.invalidateQueries({ queryKey: ["students"] });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "An unexpected error occurred during import.",
      );
      setImportStep("preview");
    } finally {
      setImportBusy(false);
    }
  }

  return (
    <AppShell title="Students" description={`${students.length} active record(s)`}>
      <form
        onSubmit={addStudent}
        className="surface-card grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <div className="space-y-2">
          <Label htmlFor="full_name">Full name</Label>
          <Input
            id="full_name"
            required
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="admission_number">Admission number</Label>
          <Input
            id="admission_number"
            required
            value={form.admission_number}
            onChange={(e) => setForm({ ...form, admission_number: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="gender">Gender</Label>
          <select
            id="gender"
            value={form.gender}
            onChange={(e) => setForm({ ...form, gender: e.target.value })}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="class_id">Class</Label>
          <select
            id="class_id"
            value={form.class_id}
            onChange={(e) => setForm({ ...form, class_id: e.target.value })}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Unassigned</option>
            {classes.map((c) => {
              const cls = c as { id: string; name: string };
              return (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              );
            })}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="guardian_name">Guardian</Label>
          <Input
            id="guardian_name"
            value={form.guardian_name}
            onChange={(e) => setForm({ ...form, guardian_name: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="guardian_phone">Guardian phone</Label>
          <Input
            id="guardian_phone"
            value={form.guardian_phone}
            onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <Button type="submit" disabled={busy}>
            Admit student
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => setShowImportDialog(true)}
            className="ml-2"
          >
            <Upload className="mr-2 size-4" /> Import students
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search by name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All classes</option>
          {classes.map((c) => {
            const cls = c as { id: string; name: string };
            return (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            );
          })}
        </select>
      </div>

      <div className="surface-card overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-3 py-3">Admission no.</th>
              <th className="px-3 py-3">Class</th>
              <th className="px-4 py-3">Guardian</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.map((s) => {
              const student = s as {
                id: string;
                full_name: string;
                admission_number: string;
                guardian_name: string | null;
                classes?: { name: string } | null;
              };
              return (
                <tr key={student.id}>
                  <td className="px-4 py-2 font-medium">{student.full_name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{student.admission_number}</td>
                  <td className="px-3 py-2">{student.classes?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {student.guardian_name ?? "—"}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-4 text-muted-foreground">
                  No students found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Import Dialog */}
      <AlertDialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <AlertDialogContent className="max-h-screen max-w-2xl overflow-y-auto">
          {importStep === "upload" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Import students</AlertDialogTitle>
                <AlertDialogDescription>
                  Upload a CSV or Excel spreadsheet with student data. Download a template to see the
                  required format.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-4">
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void downloadStudentImportTemplate()}
                  >
                    <Download className="mr-2 size-4" /> Download template
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="spreadsheet">Spreadsheet file (CSV or Excel)</Label>
                  <Input
                    id="spreadsheet"
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleImportFileChange}
                  />
                  {importFile && (
                    <p className="text-xs text-muted-foreground">
                      Selected: <span className="font-medium">{importFile.name}</span> (
                      {(importFile.size / 1024).toFixed(1)} KB)
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="photos">
                    Photos archive (optional ZIP with student photos)
                  </Label>
                  <Input
                    id="photos"
                    type="file"
                    accept=".zip"
                    onChange={handlePhotoArchiveChange}
                  />
                  {photoArchiveFile && (
                    <p className="text-xs text-muted-foreground">
                      Selected: <span className="font-medium">{photoArchiveFile.name}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <Button
                  onClick={() => void validateImportFile()}
                  disabled={!importFile || importBusy}
                >
                  {importBusy ? "Validating..." : "Continue"}
                </Button>
              </div>
            </>
          )}

          {importStep === "preview" && importPreview && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Review import preview</AlertDialogTitle>
                <AlertDialogDescription>
                  Check the summary and any warnings before importing.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="text-lg font-semibold">{importPreview.summary.total}</p>
                  </div>
                  <div className="rounded-lg bg-success/15 p-3">
                    <p className="text-xs text-muted-foreground">Valid</p>
                    <p className="text-lg font-semibold text-success">{importPreview.summary.valid}</p>
                  </div>
                  <div className="rounded-lg bg-warning/15 p-3">
                    <p className="text-xs text-muted-foreground">Duplicates</p>
                    <p className="text-lg font-semibold text-warning">
                      {importPreview.summary.duplicates}
                    </p>
                  </div>
                  <div className="rounded-lg bg-error/15 p-3">
                    <p className="text-xs text-muted-foreground">Invalid</p>
                    <p className="text-lg font-semibold text-error">{importPreview.summary.invalid}</p>
                  </div>
                </div>

                {importPreview.summary.matchedPhoto > 0 && (
                  <div className="rounded-lg bg-success/15 p-3">
                    <p className="text-sm font-medium text-success">
                      ✓ {importPreview.summary.matchedPhoto} photos matched
                    </p>
                  </div>
                )}

                {importPreview.rows.filter((r) => r.status !== "valid").length > 0 && (
                  <div className="max-h-48 overflow-y-auto rounded border border-border">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted">
                        <tr>
                          <th className="px-2 py-1 text-left font-medium">Student ID</th>
                          <th className="px-2 py-1 text-left font-medium">Status</th>
                          <th className="px-2 py-1 text-left font-medium">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {importPreview.rows
                          .filter((r) => r.status !== "valid")
                          .map((row, idx) => (
                            <tr key={idx}>
                              <td className="px-2 py-1 font-mono text-muted-foreground">
                                {row.admission_number}
                              </td>
                              <td className="px-2 py-1">
                                <span
                                  className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${
                                    row.status === "duplicate"
                                      ? "bg-warning/20 text-warning"
                                      : "bg-error/20 text-error"
                                  }`}
                                >
                                  {row.status}
                                </span>
                              </td>
                              <td className="px-2 py-1 text-muted-foreground">
                                {row.reasons.join("; ")}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3">
                <AlertDialogCancel>Back</AlertDialogCancel>
                <Button
                  onClick={() => {
                    setImportStep("upload");
                    setImportPreview(null);
                  }}
                >
                  Upload different file
                </Button>
                <AlertDialogAction
                  onClick={() => void confirmImport()}
                  disabled={!importPreview.validRows.length || importBusy}
                  className={
                    !importPreview.validRows.length
                      ? "opacity-50 cursor-not-allowed"
                      : ""
                  }
                >
                  {importBusy ? "Importing..." : `Import ${importPreview.summary.valid} students`}
                </AlertDialogAction>
              </div>
            </>
          )}

          {importStep === "importing" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Importing...</AlertDialogTitle>
                <AlertDialogDescription>
                  Please wait while students are being imported.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex justify-center py-8">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Processing import...</p>
                </div>
              </div>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
