-- O destaque não possui comportamento na Jornada e pode confundir a ordem dos dias.
ALTER TABLE public.journey_contents
  DROP COLUMN IF EXISTS is_featured;
