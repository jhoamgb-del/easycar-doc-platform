import { authenticateRequest, json, requireAdmin } from '../_lib/supabase.js';

const ALLOWED_ROLES = new Set(['seller', 'manager', 'admin']);

function cleanEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function cleanName(value, email) {
  return String(value || '').trim() || email;
}

function cleanRole(value) {
  return ALLOWED_ROLES.has(value) ? value : 'seller';
}

async function listUsers(supabase) {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const ids = data.users.map(user => user.id);
  const { data: profiles, error: profileError } = await supabase
    .from('doc_user_profiles')
    .select('id, full_name, role, active, updated_at')
    .in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  if (profileError) throw profileError;
  const profileMap = new Map((profiles || []).map(profile => [profile.id, profile]));
  return data.users
    .map(user => {
      const profile = profileMap.get(user.id) || {};
      return {
        id: user.id,
        email: user.email,
        full_name: profile.full_name || user.user_metadata?.full_name || user.email,
        role: profile.role || 'seller',
        active: profile.active !== false,
        last_sign_in_at: user.last_sign_in_at,
        created_at: user.created_at,
        updated_at: profile.updated_at || user.updated_at
      };
    })
    .sort((a, b) => String(a.email).localeCompare(String(b.email)));
}

async function upsertProfile(supabase, user, payload = {}) {
  const email = cleanEmail(user.email);
  const fullName = cleanName(payload.full_name, email);
  const role = cleanRole(payload.role);
  const active = payload.active !== false;
  const { error } = await supabase
    .from('doc_user_profiles')
    .upsert({
      id: user.id,
      full_name: fullName,
      role,
      active,
      updated_at: new Date().toISOString()
    });
  if (error) throw error;
}

async function findUserByEmail(supabase, email) {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find(user => cleanEmail(user.email) === cleanEmail(email)) || null;
}

async function createUser(supabase, payload) {
  const email = cleanEmail(payload.email);
  if (!email) throw new Error('Email is required');
  const password = String(payload.password || '');
  if (payload.mode !== 'invite' && password.length < 8) throw new Error('Password must have at least 8 characters');

  let user;
  if (payload.mode === 'invite') {
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { full_name: cleanName(payload.full_name, email) }
    });
    if (error) throw error;
    user = data.user;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: cleanName(payload.full_name, email) }
    });
    if (error) throw error;
    user = data.user;
  }

  await upsertProfile(supabase, user, payload);
  return user;
}

async function updateUser(supabase, payload, currentUserId) {
  const id = String(payload.id || '');
  if (!id) throw new Error('User id is required');
  if (id === currentUserId && (payload.role && payload.role !== 'admin')) {
    throw new Error('You cannot remove your own admin role');
  }
  if (id === currentUserId && payload.active === false) {
    throw new Error('You cannot deactivate your own user');
  }
  const attributes = {};
  if (payload.email) attributes.email = cleanEmail(payload.email);
  if (payload.password) {
    if (String(payload.password).length < 8) throw new Error('Password must have at least 8 characters');
    attributes.password = String(payload.password);
  }
  if (payload.full_name) attributes.user_metadata = { full_name: String(payload.full_name).trim() };
  if (Object.keys(attributes).length) {
    const { error } = await supabase.auth.admin.updateUserById(id, attributes);
    if (error) throw error;
  }
  const user = payload.email ? await findUserByEmail(supabase, payload.email) : { id, email: payload.email || '' };
  await upsertProfile(supabase, user, payload);
}

async function deleteUser(supabase, id, hardDelete = false, currentUserId) {
  if (!id) throw new Error('User id is required');
  if (id === currentUserId) throw new Error('You cannot delete your own user');
  const { error: profileError } = await supabase
    .from('doc_user_profiles')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (profileError) throw profileError;
  if (hardDelete) {
    const { error } = await supabase.auth.admin.deleteUser(id);
    if (error) throw error;
  }
}

export default async function handler(req, res) {
  try {
    const auth = requireAdmin(await authenticateRequest(req));
    if (auth.error) return json(res, 403, { error: auth.error });

    if (req.method === 'GET') {
      return json(res, 200, { users: await listUsers(auth.supabase) });
    }

    const action = req.body?.action;
    if (req.method === 'POST' && action === 'create') {
      await createUser(auth.supabase, req.body);
      return json(res, 200, { ok: true, users: await listUsers(auth.supabase) });
    }
    if (req.method === 'POST' && action === 'update') {
      await updateUser(auth.supabase, req.body, auth.user.id);
      return json(res, 200, { ok: true, users: await listUsers(auth.supabase) });
    }
    if (req.method === 'POST' && action === 'delete') {
      await deleteUser(auth.supabase, req.body?.id, Boolean(req.body?.hardDelete), auth.user.id);
      return json(res, 200, { ok: true, users: await listUsers(auth.supabase) });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Unable to manage users' });
  }
}
