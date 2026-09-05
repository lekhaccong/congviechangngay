import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const publishableKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim();

export const supabaseConfigured = Boolean(url && publishableKey);
export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url, publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })
  : null;
