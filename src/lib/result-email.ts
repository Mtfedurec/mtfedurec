import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_RESULT_EMAIL_TEMPLATE = `Dear Parent/Guardian,

Your child's academic result for {{term}} {{session}} is now available on the MayDan EduRecord portal.

Please log in to view the result.

Student: {{student_name}}
Class: {{class}}

View Result:
{{portal_link}}

Thank you,
{{school_name}}`;

export async function sendParentResultNotification(payload: {
  to: string;
  student_name: string;
  class_name: string;
  term: string;
  session: string;
  school_name: string;
  portal_link: string;
  sender_email?: string;
  reply_to_email?: string;
  template?: string;
}) {
  try {
    const { data, error } = await supabase.functions.invoke("notify-parent-result", {
      body: payload,
    });

    if (error) {
      return {
        status: "failed" as const,
        message: error.message || "Result notification could not be delivered.",
      };
    }

    return {
      status: (data?.status as "sent" | "not-configured" | "failed") || "failed",
      message: String(data?.message || "Result notification status is unavailable."),
    };
  } catch (error) {
    return {
      status: "failed" as const,
      message:
        error instanceof Error
          ? "Result notification could not be delivered."
          : "Result notification could not be delivered.",
    };
  }
}
