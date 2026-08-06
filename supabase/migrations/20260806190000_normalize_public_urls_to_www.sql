-- Keep persisted first-party links on the final Vercel host.
-- pg_net drops Authorization when following a redirect between these hosts.
UPDATE public.journeys
SET trial_url = regexp_replace(
  trial_url,
  '^https://evolucaoclinica\\.app\\.br',
  'https://www.evolucaoclinica.app.br'
)
WHERE trial_url LIKE 'https://evolucaoclinica.app.br%';

UPDATE public.journey_contents
SET cta_url = regexp_replace(
  cta_url,
  '^https://evolucaoclinica\\.app\\.br',
  'https://www.evolucaoclinica.app.br'
)
WHERE cta_url LIKE 'https://evolucaoclinica.app.br%';
