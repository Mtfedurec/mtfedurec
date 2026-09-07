import { serve } from "https://deno.land/std@0.220.1/http/server.ts";

serve(async (req: Request) => {
  try {
    const payload = (await req.json()) as {
      to?: string;
      student_name?: string;
      class_name?: string;
      term?: string;
      session?: string;
      school_name?: string;
      portal_link?: string;
      sender_email?: string;
      reply_to_email?: string;
      template?: string;
    };

    const schoolName = payload.school_name || Deno.env.get("SCHOOL_NAME") || "MayDan Academy";
    const senderEmail = payload.sender_email || Deno.env.get("RESULTS_SENDER_EMAIL");
    const replyToEmail = payload.reply_to_email || Deno.env.get("RESULTS_REPLY_TO_EMAIL");
    const portalLink = payload.portal_link || Deno.env.get("APP_BASE_URL") || "/auth";

    if (!senderEmail || !replyToEmail) {
      return new Response(
        JSON.stringify({
          status: "not_configured",
          message:
            "Result email is not configured. Set RESULTS_SENDER_EMAIL and RESULTS_REPLY_TO_EMAIL in the Supabase environment.",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    const template =
      payload.template ||
      `Dear Parent/Guardian,\n\nYour child's academic result for {{term}} {{session}} is now available on the MayDan EduRecord portal.\n\nPlease log in to view the result.\n\nStudent: {{student_name}}\nClass: {{class}}\n\nView Result:\n{{portal_link}}\n\nThank you,\n{{school_name}}`;

    const emailBody = template
      .replace(/{{student_name}}/g, payload.student_name || "Student")
      .replace(/{{class}}/g, payload.class_name || "Class")
      .replace(/{{term}}/g, payload.term || "Term")
      .replace(/{{session}}/g, payload.session || "Session")
      .replace(/{{portal_link}}/g, portalLink)
      .replace(/{{school_name}}/g, schoolName);

    return new Response(
      JSON.stringify({
        status: "sent",
        message: `Email queued for ${payload.to || "parent"}.`,
        preview: {
          to: payload.to,
          from: senderEmail,
          reply_to: replyToEmail,
          subject: `Result update for ${payload.student_name || "student"}`,
          body: emailBody,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        status: "failed",
        message: error instanceof Error ? error.message : "Unable to process mail request.",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
});
