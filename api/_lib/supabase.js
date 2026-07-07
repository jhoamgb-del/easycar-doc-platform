import { createClient } from '@supabase/supabase-js';

function required(name, fallbackName) {
  const value = process.env[name] || (fallbackName ? process.env[fallbackName] : '');
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

export function adminClient() {
  return createClient(
    required('SUPABASE_URL', 'VITE_SUPABASE_URL'),
    required('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function authenticateRequest(req) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return { error: 'Authentication required' };

  const supabase = adminClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return { error: 'Invalid or expired session' };

  const { data: profile, error: profileError } = await supabase
    .from('doc_user_profiles')
    .select('id, full_name, role, active')
    .eq('id', data.user.id)
    .single();

  if (profileError || !profile?.active) return { error: 'User is not active' };
  return { supabase, user: data.user, profile };
}

export async function findAuthorizedSale(supabase, profile, saleId) {
  let query = supabase.from('doc_sales').select('*').eq('id', saleId);
  if (profile.role !== 'admin') query = query.eq('created_by', profile.id);
  const { data, error } = await query.single();
  if (error || !data) return { error: 'Sale not found or access denied' };
  return { sale: data };
}

export function requireAdmin(auth) {
  if (auth.error) return auth;
  if (auth.profile?.role !== 'admin') return { error: 'Admin access required' };
  return auth;
}

export function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}
