import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigurationError = !supabaseUrl || !supabasePublishableKey
  ? "Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY para usar os efeitos sonoros."
  : "";

export const supabase = supabaseConfigurationError
  ? null
  : createClient(supabaseUrl, supabasePublishableKey);