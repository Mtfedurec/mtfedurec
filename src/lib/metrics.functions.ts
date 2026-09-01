import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const sampleSchema = z.union([
  z.object({
    kind: z.literal("http"),
    method: z.string().min(1).max(10),
    path: z.string().min(1).max(300),
    status_code: z.number().int().min(100).max(599),
    duration_ms: z.number().min(0).max(600000),
  }),
  z.object({
    kind: z.literal("db"),
    model: z.string().min(1).max(60),
    action: z.string().min(1).max(30),
    duration_ms: z.number().min(0).max(600000),
  }),
]);

export const recordMetricSamples = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ samples: z.array(sampleSchema).max(200) }).parse(input))
  .handler(async ({ data }) => {
    const { recordSamples } = await import("./metrics.server");
    await recordSamples(data.samples);
    return { accepted: data.samples.length };
  });

export const getPerformanceSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ windowMinutes: z.number().int().min(5).max(1440) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isManager } = await context.supabase.rpc("is_manager", {
      _user_id: context.userId,
    });
    if (!isManager) throw new Error("Forbidden");
    const { buildSummary } = await import("./metrics.server");
    return buildSummary(data.windowMinutes);
  });
