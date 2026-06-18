import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Atenção: VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não estão configurados no arquivo .env");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export default supabase;
