import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Lock, Save, Users, History, CalendarCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { getValidatedSession, userHasAnyRole } from "@/integrations/supabase/auth-helper";
import { useClasses, useProfile, useStudents } from "@/lib/data";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/attendance")({
  beforeLoad: async () => {
    const session = await getValidatedSession();
    if (!session?.user) throw redirect({ to: "/auth" });

    if (!(await userHasAnyRole(session.user.id, ["admin", "head_teacher", "teacher"]))) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({
    meta: [
      { title: "Student Attendance — MTF EduRec" },
      { name: "description", content: "Daily student register and punctuality tracking." },
    ],
  }),
  component: AttendancePage,
});

function AttendancePage() {
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  const { data: allClasses = [] } = useClasses();
  const { data: allStudents = [] } = useStudents();

  const roles = profile?.roles ?? [];
  const isAdmin = roles.includes("admin") || roles.includes("head_teacher");

  const todayLagos = useMemo(() => {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  }, []);

  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(todayLagos);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, "present" | "absent">>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [historyStudentId, setHistoryStudentId] = useState<string>("");

  const { data: assignedClassIds = [] } = useQuery({
    queryKey: ["teacher-assigned-classes", profile?.id],
    enabled: Boolean(profile?.id && !isAdmin),
    queryFn: async () => {
      const userId = profile!.id;
      const { data: directClasses } = await supabase
        .from("classes")
        .select("id")
        .eq("class_teacher_id", userId);

      const { data: subjectClasses } = await supabase
        .from("class_subjects")
        .select("class_id")
        .eq("teacher_id", userId);

      const ids = new Set<string>();
      directClasses?.forEach((c) => ids.add(c.id));
      subjectClasses?.forEach((sc) => sc.class_id && ids.add(sc.class_id));
      return Array.from(ids);
    },
  });

  const availableClasses = useMemo(() => {
    if (isAdmin) return allClasses;
    return allClasses.filter((c) => assignedClassIds.includes(c.id));
  }, [allClasses, assignedClassIds, isAdmin]);

  useEffect(() => {
    if (!selectedClassId && availableClasses.length > 0) {
      setSelectedClassId(availableClasses[0].id);
    }
  }, [availableClasses, selectedClassId]);

  const classStudents = useMemo(() => {
    if (!selectedClassId) return [];
    return allStudents.filter((s) => s.class_id === selectedClassId && s.status === "active");
  }, [allStudents, selectedClassId]);

  const { data: existingAttendance = [], refetch: refetchAttendance } = useQuery({
    queryKey: ["student-attendance", selectedClassId, selectedDate],
    enabled: Boolean(selectedClassId && selectedDate),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_attendance")
        .select("*")
        .eq("class_id", selectedClassId)
        .eq("attendance_date", selectedDate);

      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const map: Record<string, "present" | "absent"> = {};
    classStudents.forEach((student) => {
      const found = existingAttendance.find((att) => att.student_id === student.id);
      map[student.id] = found ? (found.status as "present" | "absent") : "present";
    });
    setAttendanceMap(map);
  }, [classStudents, existingAttendance]);

  const isHistorical = selectedDate < todayLagos;
  const presentCount = Object.values(attendanceMap).filter((v) => v === "present").length;
  const absentCount = Object.values(attendanceMap).filter((v) => v === "absent").length;

  const handleStatusChange = (studentId: string, status: "present" | "absent") => {
    if (isHistorical) return;
    setAttendanceMap((prev) => ({ ...prev, [studentId]: status }));
  };

  const handleMarkAllPresent = () => {
    if (isHistorical) return;
    const map: Record<string, "present" | "absent"> = {};
    classStudents.forEach((s) => {
      map[s.id] = "present";
    });
    setAttendanceMap(map);
    toast.success("All students marked present");
  };

  const handleSaveAttendance = async () => {
    if (isHistorical) {
      toast.error("Cannot modify historical attendance. Records are locked.");
      return;
    }
    if (!selectedClassId) {
      toast.error("Please select a class first.");
      return;
    }

    setIsSaving(true);
    setSaveStatus("Saving...");

    try {
      const payload = classStudents.map((student) => ({
        student_id: student.id,
        class_id: selectedClassId,
        attendance_date: selectedDate,
        status: attendanceMap[student.id] || "present",
        recorded_by: profile?.id || null,
      }));

      const { error } = await supabase
        .from("student_attendance")
        .upsert(payload, { onConflict: "student_id,attendance_date" });

      if (error) throw error;

      setSaveStatus("Saved successfully");
      toast.success("Attendance saved successfully");
      queryClient.invalidateQueries({ queryKey: ["student-attendance"] });
      queryClient.invalidateQueries({ queryKey: ["student-attendance-history"] });
      refetchAttendance();
    } catch (err: any) {
      const msg = err.message || "Failed to save attendance";
      setSaveStatus(`Error: ${msg}`);
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const { data: historyRecords = [], isLoading: historyLoading } = useQuery({
    queryKey: ["student-attendance-history", historyStudentId],
    enabled: Boolean(historyStudentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_attendance")
        .select("*, classes(name)")
        .eq("student_id", historyStudentId)
        .order("attendance_date", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });

  const historyStats = useMemo(() => {
    const total = historyRecords.length;
    if (total === 0) return { total: 0, present: 0, absent: 0, percentage: 0 };
    const present = historyRecords.filter((r) => r.status === "present").length;
    const absent = historyRecords.filter((r) => r.status === "absent").length;
    return { total, present, absent, percentage: Number(((present / total) * 100).toFixed(1)) };
  }, [historyRecords]);

  const historyAvailableStudents = useMemo(() => {
    if (isAdmin) return allStudents;
    return allStudents.filter((s) => s.class_id && assignedClassIds.includes(s.class_id));
  }, [allStudents, assignedClassIds, isAdmin]);


  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Student Attendance</h1>
          <p className="text-muted-foreground">Manage daily attendance and view history.</p>
        </div>

        <Tabs defaultValue="register" className="space-y-6">
          <TabsList>
            <TabsTrigger value="register" className="gap-2">
              <CalendarCheck className="h-4 w-4" /> Daily Register
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" /> Attendance Records
            </TabsTrigger>
          </TabsList>

          <TabsContent value="register" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Daily Register Controls</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Class</Label>
                  <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                    <SelectTrigger><SelectValue placeholder="Select class..." /></SelectTrigger>
                    <SelectContent>
                      {availableClasses.map((cls) => (
                        <SelectItem key={cls.id} value={cls.id}>{cls.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Date (Africa/Lagos)</Label>
                  <div className="flex gap-2">
                    <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
                    <Button variant="outline" onClick={() => setSelectedDate(todayLagos)}>Today</Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {isHistorical && (
              <div className="flex items-center gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-amber-950">
                <Lock className="h-5 w-5 text-amber-600" />
                <div className="text-sm font-medium">Historical Attendance Locked: Date is read-only.</div>
              </div>
            )}

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Roster ({classStudents.length})</CardTitle>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Badge className="bg-emerald-600">Present: {presentCount}</Badge>
                    <Badge variant="destructive">Absent: {absentCount}</Badge>
                  </div>
                  {!isHistorical && (
                    <Button variant="outline" size="sm" onClick={handleMarkAllPresent}>Mark All Present</Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {classStudents.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">No active students.</div>
                ) : (
                  <div className="space-y-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[80px]">S/N</TableHead>
                          <TableHead>Student Name</TableHead>
                          <TableHead className="text-right">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {classStudents.map((s, idx) => {
                          const status = attendanceMap[s.id] || "present";
                          return (
                            <TableRow key={s.id}>
                              <TableCell>{idx + 1}</TableCell>
                              <TableCell className="font-medium">{s.full_name}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button size="sm" variant={status === "present" ? "default" : "outline"} className={status === "present" ? "bg-emerald-600 hover:bg-emerald-700" : ""} onClick={() => handleStatusChange(s.id, "present")} disabled={isHistorical}>Present</Button>
                                  <Button size="sm" variant={status === "absent" ? "destructive" : "outline"} onClick={() => handleStatusChange(s.id, "absent")} disabled={isHistorical}>Absent</Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>

                    {!isHistorical && (
                      <div className="flex items-center justify-between pt-4 border-t">
                        <span className="text-sm font-medium text-emerald-600">{saveStatus}</span>
                        <Button onClick={handleSaveAttendance} disabled={isSaving} className="gap-2"><Save className="h-4 w-4" /> {isSaving ? "Saving..." : "Save Attendance"}</Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>


          {/* TAB 2: ATTENDANCE RECORDS & HISTORY */}
          <TabsContent value="history" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>View Student Attendance History</CardTitle>
                <CardDescription>Select a student to inspect their attendance percentage and daily logs.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 max-w-md">
                  <Label>Student</Label>
                  <Select value={historyStudentId} onValueChange={setHistoryStudentId}>
                    <SelectTrigger><SelectValue placeholder="Select student..." /></SelectTrigger>
                    <SelectContent>
                      {historyAvailableStudents.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.full_name} ({s.admission_number || "No Admin No."})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {historyStudentId && (
                  <div className="pt-4 space-y-6">
                    <div className="grid gap-4 sm:grid-cols-4">
                      <Card className="bg-muted/50">
                        <CardContent className="pt-6">
                          <div className="text-2xl font-bold">{historyStats.total}</div>
                          <p className="text-xs text-muted-foreground">Total School Days</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-emerald-500/5">
                        <CardContent className="pt-6">
                          <div className="text-2xl font-bold text-emerald-600">{historyStats.present}</div>
                          <p className="text-xs text-muted-foreground">Days Present</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-destructive/5">
                        <CardContent className="pt-6">
                          <div className="text-2xl font-bold text-destructive">{historyStats.absent}</div>
                          <p className="text-xs text-muted-foreground">Days Absent</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-primary/5">
                        <CardContent className="pt-6">
                          <div className="text-2xl font-bold text-primary">{historyStats.percentage}%</div>
                          <p className="text-xs text-muted-foreground">Attendance Percentage</p>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm">Attendance Logs</h4>
                      {historyLoading ? (
                        <div className="py-6 text-center text-muted-foreground">Loading history...</div>
                      ) : historyRecords.length === 0 ? (
                        <div className="py-6 text-center text-muted-foreground">No historical records found for this student.</div>
                      ) : (
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Class</TableHead>
                                <TableHead className="text-right">Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {historyRecords.map((r) => (
                                <TableRow key={r.id}>
                                  <TableCell className="font-medium">{r.attendance_date}</TableCell>
                                  <TableCell>{(r.classes as any)?.name || "Unknown"}</TableCell>
                                  <TableCell className="text-right">
                                    <Badge className={r.status === "present" ? "bg-emerald-600" : "bg-destructive"}>
                                      {r.status === "present" ? "Present" : "Absent"}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

