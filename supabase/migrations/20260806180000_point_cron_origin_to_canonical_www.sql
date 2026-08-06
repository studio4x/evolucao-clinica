-- pg_net follows redirects, but intentionally drops Authorization on a cross-host redirect.
-- Use the final canonical host so the Vault Bearer reaches the Vercel function.
DO $$
DECLARE
  origin_secret_id uuid;
BEGIN
  SELECT id
    INTO origin_secret_id
    FROM vault.secrets
   WHERE name = 'lifecycle_origin';

  IF origin_secret_id IS NULL THEN
    RAISE EXCEPTION 'Vault secret lifecycle_origin is required';
  END IF;

  PERFORM vault.update_secret(
    origin_secret_id,
    'https://www.evolucaoclinica.app.br',
    'lifecycle_origin',
    NULL,
    NULL
  );
END
$$;
