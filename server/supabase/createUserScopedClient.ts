import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type UserScopedClientOptions = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  accessToken: string;
};

/**
 * Creates a request-scoped Supabase client that keeps RLS bound to the caller.
 * The server must never use the service role key for this path.
 */
export function createUserScopedClient({
  supabaseUrl,
  supabaseAnonKey,
  accessToken,
}: UserScopedClientOptions): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}
