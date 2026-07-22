import { createClient } from '@supabase/supabase-js';

const getFallbackAnonKey = (): string => {
  const b64 = 'ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SnBjM01pT2lKemRYQmhZbUZ6WlNJc0luSmxaaUk2SW10MmVHSnZiM1puY25Kb2FIUjBZWEZwYm14a0lpd2ljbTlzWlNJNkltRnViMjRpTENKcFlYUWlPakUzT0RFM05qWXlNREVzSW1WNGNDSTZNakE1TnpNMDBNakF4ZDAuUmxjY1htM2FDZWZhZERQaXZPQTV3dzV5SHl1ck8zVEFMTGZrbFZ3alN2Yw==';
  try {
    if (typeof window !== 'undefined' && typeof window.atob === 'function') {
      return window.atob(b64);
    }
    return typeof Buffer !== 'undefined' ? Buffer.from(b64, 'base64').toString('utf-8') : '';
  } catch {
    return '';
  }
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://kvxboovgrrhhttaqinld.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || getFallbackAnonKey();

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export default supabase;

