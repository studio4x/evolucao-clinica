-- Create public.whatsapp_leads table
CREATE TABLE public.whatsapp_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    message TEXT NOT NULL,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_term TEXT,
    utm_content TEXT,
    referrer TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.whatsapp_leads ENABLE ROW LEVEL SECURITY;

-- Policies

-- Allow anyone (public/anon) to insert leads
CREATE POLICY "Allow public insert to whatsapp_leads" 
ON public.whatsapp_leads 
FOR INSERT 
WITH CHECK (true);

-- Allow only administrators to select leads
CREATE POLICY "Allow admin select to whatsapp_leads" 
ON public.whatsapp_leads 
FOR SELECT 
TO authenticated 
USING (is_admin());

-- Allow only administrators to delete leads
CREATE POLICY "Allow admin delete to whatsapp_leads" 
ON public.whatsapp_leads 
FOR DELETE 
TO authenticated 
USING (is_admin());

-- Grant explicit privileges to Supabase roles
GRANT ALL ON TABLE public.whatsapp_leads TO postgres, service_role;
GRANT INSERT ON TABLE public.whatsapp_leads TO anon, authenticated;
GRANT SELECT, DELETE ON TABLE public.whatsapp_leads TO authenticated;
