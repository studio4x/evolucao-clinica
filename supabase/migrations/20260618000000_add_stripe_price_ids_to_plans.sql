-- Adiciona colunas para vincular os IDs dos preços do Stripe na tabela de planos do SaaS
ALTER TABLE public.plans 
ADD COLUMN IF NOT EXISTS stripe_sandbox_price_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_prod_price_id TEXT;

-- Comentários descritivos nas colunas
COMMENT ON COLUMN public.plans.stripe_sandbox_price_id IS 'ID do preço correspondente no Stripe em ambiente de testes (Sandbox)';
COMMENT ON COLUMN public.plans.stripe_prod_price_id IS 'ID do preço correspondente no Stripe em ambiente de produção';
