const fs = require('fs');

const part1 = `import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const sendSingleReportCardEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        reportCardId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { reportCardId } = data;

    const { data: roleRecords, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (roleError) {
      throw new Error("Failed to verify authorization: " + roleError.message);
    }

    const isManager = (roleRecords ?? []).some(
      (r) => r.role === "admin" || r.role === "head_teacher",
    );

    if (!isManager) {
      throw new Error("Unauthorized: Only administrators and head teachers can send official report cards.");
    }

    const { data: reportCard, error: cardError } = await supabase
      .from("report_cards")
      .select(
        "id, student_id, term_id, average, published, teacher_comment, head_comment, terms(name, academic_sessions(name))",
      )
      .eq("id", reportCardId)
      .single();

    if (cardError || !reportCard) {
      throw new Error("Report card not found.");
    }

    if (!reportCard.published) {
      throw new Error("Report card must be published before sending to parent.");
    }

    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id, full_name, admission_number, guardian_name, guardian_email, classes(name)")
      .eq("id", reportCard.student_id)
      .single();

    if (studentError || !student) {
      throw new Error("Student record not found.");
    }
`;
