CREATE TABLE public.perf_metrics (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('http','db')),
  method TEXT,
  path TEXT,
  status_code INTEGER,
  model TEXT,
  action TEXT,
  duration_ms NUMERIC NOT NULL CHECK (duration_ms >= 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX perf_metrics_created_at_idx ON public.perf_metrics (created_at DESC);
CREATE INDEX perf_metrics_kind_idx ON public.perf_metrics (kind, created_at DESC);

GRANT SELECT ON public.perf_metrics TO authenticated;
GRANT ALL ON public.perf_metrics TO service_role;

ALTER TABLE public.perf_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can read performance metrics"
  ON public.perf_metrics FOR SELECT TO authenticated
  USING (public.is_manager(auth.uid()));

CREATE OR REPLACE FUNCTION public.prune_perf_metrics()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.perf_metrics WHERE created_at < now() - interval '7 days';
$$;

REVOKE ALL ON FUNCTION public.prune_perf_metrics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_perf_metrics() TO service_role;