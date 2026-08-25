-- Additive integrity checks for academic records.
-- Existing rows are not scanned by these NOT VALID constraints until explicitly validated.
ALTER TABLE public.assessment_components
  ADD CONSTRAINT assessment_components_max_score_nonnegative
  CHECK (max_score >= 0) NOT VALID;

ALTER TABLE public.assessment_scores
  ADD CONSTRAINT assessment_scores_score_nonnegative
  CHECK (score >= 0) NOT VALID;

ALTER TABLE public.behaviour_assessments
  ADD CONSTRAINT behaviour_assessments_rating_range
  CHECK (rating BETWEEN 1 AND 5) NOT VALID;

CREATE OR REPLACE FUNCTION public.validate_assessment_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  component_max NUMERIC;
BEGIN
  SELECT max_score INTO component_max
  FROM public.assessment_components
  WHERE id = NEW.component_id;

  IF component_max IS NULL THEN
    RAISE EXCEPTION 'Assessment component does not exist';
  END IF;

  IF NEW.score > component_max THEN
    RAISE EXCEPTION 'Assessment score exceeds component maximum';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_assessment_score
BEFORE INSERT OR UPDATE OF component_id, score ON public.assessment_scores
FOR EACH ROW EXECUTE FUNCTION public.validate_assessment_score();

CREATE OR REPLACE FUNCTION public.validate_assessment_component_max_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.assessment_scores
    WHERE component_id = NEW.id
      AND score > NEW.max_score
  ) THEN
    RAISE EXCEPTION 'Component maximum cannot be lower than an existing assessment score';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_assessment_component_max_score
BEFORE UPDATE OF max_score ON public.assessment_components
FOR EACH ROW EXECUTE FUNCTION public.validate_assessment_component_max_score();