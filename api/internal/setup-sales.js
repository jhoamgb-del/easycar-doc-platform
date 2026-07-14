import crypto from 'node:crypto';
import { adminClient, json } from '../_lib/supabase.js';

function sameToken(received, expected) {
  const left = Buffer.from(String(received || ''));
  const right = Buffer.from(String(expected || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const bootstrapToken = process.env.EASYCAR_BOOTSTRAP_TOKEN;
  if (!bootstrapToken || !sameToken(req.headers['x-easycar-bootstrap-token'], bootstrapToken)) {
    return json(res, 404, { error: 'Not found' });
  }

  const email = 'sales@easycarus.com';
  const password = String(req.body?.password || '');
  if (password.length < 12) return json(res, 400, { error: 'Password does not meet the minimum length' });

  try {
    const supabase = adminClient();
    const { data: users, error: usersError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersError) throw usersError;

    let user = users.users.find(item => String(item.email || '').toLowerCase() === email);
    let action = 'updated';
    if (user) {
      const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
        password,
        email_confirm: true,
        user_metadata: { ...(user.user_metadata || {}), full_name: 'EasyCar Sales' }
      });
      if (error) throw error;
      user = data.user;
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: 'EasyCar Sales' }
      });
      if (error) throw error;
      user = data.user;
      action = 'created';
    }

    const { error: profileError } = await supabase
      .from('doc_user_profiles')
      .upsert({ id: user.id, full_name: 'EasyCar Sales', role: 'seller', active: true, updated_at: new Date().toISOString() });
    if (profileError) throw profileError;

    return json(res, 200, { ok: true, action, email, role: 'seller' });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Unable to configure account' });
  }
}
