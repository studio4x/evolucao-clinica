-- Create transactions table
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    professional_id UUID REFERENCES public.professionals(id) ON DELETE CASCADE,
    stripe_invoice_id TEXT,
    stripe_subscription_id TEXT,
    amount NUMERIC NOT NULL,
    currency TEXT DEFAULT 'brl',
    plan_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('paid', 'refunded', 'refund_requested', 'failed', 'processing')),
    invoice_pdf_url TEXT,
    stripe_invoice_url TEXT,
    refund_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Enable RLS
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own transactions" 
ON public.transactions 
FOR SELECT 
USING (auth.uid() = professional_id);

CREATE POLICY "Users can insert their own transactions" 
ON public.transactions 
FOR INSERT 
WITH CHECK (auth.uid() = professional_id);

CREATE POLICY "Users can update their own transactions"
ON public.transactions
FOR UPDATE
USING (auth.uid() = professional_id);

CREATE POLICY "Admins can do everything on transactions" 
ON public.transactions 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.professionals 
    WHERE id = auth.uid() AND role = 'admin'
  )
);
