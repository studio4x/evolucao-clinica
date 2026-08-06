-- Repair the prior normalization with a literal replacement so existing
-- first-party links cannot retain the redirecting non-www host.
UPDATE public.journeys
SET trial_url = replace(
  trial_url,
  'https://evolucaoclinica.app.br',
  'https://www.evolucaoclinica.app.br'
)
WHERE trial_url LIKE 'https://evolucaoclinica.app.br%';

UPDATE public.journey_contents
SET cta_url = replace(
  cta_url,
  'https://evolucaoclinica.app.br',
  'https://www.evolucaoclinica.app.br'
)
WHERE cta_url LIKE 'https://evolucaoclinica.app.br%';
