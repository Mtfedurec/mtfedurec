with open('src/lib/report-email.functions.ts', 'w', encoding='utf-8') as f:
    f.write('''import { createServerFn } from "@tanstack/react-start";
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

with open('src/lib/report-email.functions.ts', 'a', encoding='utf-8') as f:
    f.write('''    const recipientEmail = student.guardian_email?.trim();
    if (!recipientEmail || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(recipientEmail)) {
      await supabase.from("report_card_email_logs").insert({
        report_card_id: reportCard.id,
        student_id: student.id,
        recipient_email: recipientEmail || "missing_email@unknown",
        status: "failed",
        error_message: "Parent/guardian email address is missing or invalid in student profile.",
        sent_by: userId,
      });

      throw new Error(
        `Invalid recipient: Student ${student.full_name} does not have a valid parent/guardian email address.`,
      );
    }

    const { data: school } = await supabase.from("school_settings").select("name, sender_email").single();
    const schoolName = school?.name || "MayDan EduRecord";
    const senderEmail = process.env.SENDER_EMAIL || school?.sender_email || "onboarding@resend.dev";

    const termName = (reportCard.terms as any)?.name || "Current Term";
    const sessionName = (reportCard.terms as any)?.academic_sessions?.name || "Academic Session";
    const className = (student.classes as any)?.name || "Assigned Class";

    const subject = `Academic Report Card: ${student.full_name} - ${termName} (${schoolName})`;
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #1e3a8a; border-bottom: 2px solid #1e3a8a; padding-bottom: 8px;">${schoolName}</h2>
        <p>Dear ${student.guardian_name || "Parent/Guardian"},</p>
        <p>We are pleased to share the official academic report card for <strong>${student.full_name}</strong> (${student.admission_number || "No Admin No."}) for <strong>${termName} (${sessionName})</strong>.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #f8fafc;">
          <tr>
            <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold;">Student Name:</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1;">${student.full_name}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold;">Class:</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1;">${className}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold;">Term Average:</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold; color: #1e3a8a;">${reportCard.average ?? "N/A"}%</td>
          </tr>
        </table>

        ${
          reportCard.head_comment
            ? `<div style="background: #eef2ff; padding: 12px; border-left: 4px solid #4f46e5; margin-bottom: 20px;">
                <strong>Head Teacher's Remark:</strong> ${reportCard.head_comment}
               </div>`
            : ""
        }

        <p>You can also log in to the school portal to view comprehensive subject continuous assessment breakdowns and behavioral metrics.</p>
        <p style="margin-top: 30px; font-size: 13px; color: #64748b;">Warm regards,<br/><strong>${schoolName} Academic Directorate</strong></p>
      </div>
    `;

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      await supabase.from("report_card_email_logs").insert({
        report_card_id: reportCard.id,
        student_id: student.id,
        recipient_email: recipientEmail,
        status: "failed",
        error_message: "RESEND_API_KEY is not configured on the server.",
        sent_by: userId,
      });

      throw new Error("Email service is not configured on the server. Please set RESEND_API_KEY in environment secrets.");
    }

    try {
      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${schoolName} <${senderEmail}>`,
          to: [recipientEmail],
          subject,
          html: htmlBody,
        }),
      });

      const resendData = await resendRes.json();

      if (!resendRes.ok) {
        const errorMsg = resendData.message || resendData.error || "Resend API error";
        await supabase.from("report_card_email_logs").insert({
          report_card_id: reportCard.id,
          student_id: student.id,
          recipient_email: recipientEmail,
          status: "failed",
          error_message: errorMsg,
          sent_by: userId,
        });

        throw new Error(`Email delivery failed: ${errorMsg}`);
      }

      await supabase.from("report_card_email_logs").insert({
        report_card_id: reportCard.id,
        student_id: student.id,
        recipient_email: recipientEmail,
        status: "sent",
        provider_message_id: resendData.id || null,
        sent_by: userId,
      });

      return {
        success: true,
        recipientEmail,
        messageId: resendData.id,
      };
    } catch (err: any) {
      await supabase.from("report_card_email_logs").insert({
        report_card_id: reportCard.id,
        student_id: student.id,
        recipient_email: recipientEmail,
        status: "failed",
        error_message: err.message || "Unknown network failure",
        sent_by: userId,
      });

      throw err;
    }
  },
});
''')
print("Part 2 appended successfully")

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
''')
print("Part 1 written")
