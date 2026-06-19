-- Adiciona restrição de unicidade para o ID da fatura do Stripe para permitir upserts seguros
ALTER TABLE public.transactions 
ADD CONSTRAINT unique_stripe_invoice_id UNIQUE (stripe_invoice_id);
