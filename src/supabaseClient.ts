import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://kvxboovgrrhhttaqinld.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2eGJvb3ZncnJoaHR0YXFpbmxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NjYyMDEsImV4cCI6MjA5NzM0MjIwMX0.RlccXm3aCefadDPivOA5ww5yHyurO3TALLfklVwjSvc';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export default supabase;
