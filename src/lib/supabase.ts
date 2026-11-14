import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const authFragment =
  typeof window === 'undefined'
    ? new URLSearchParams()
    : new URLSearchParams(window.location.hash.slice(1));
const authQuery =
  typeof window === 'undefined'
    ? new URLSearchParams()
    : new URLSearchParams(window.location.search);
let authRedirectError = '';
if (authFragment.has('error') || authQuery.has('error')) {
  authRedirectError =
    authFragment.get('error_description') ?? authQuery.get('error_description') ?? 'Invalid link.';
}

export function consumeAuthRedirectError() {
  const error = authRedirectError;
  authRedirectError = '';
  return error;
}

export const supabase = url && publishableKey ? createClient(url, publishableKey) : undefined;
