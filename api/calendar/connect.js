import crypto from 'node:crypto';
import { authenticateRequest, json } from '../_lib/supabase.js';

function feedUrl(req, token) {
  const forwardedHost = req.headers['x-forwarded-host'];
  const host = forwardedHost || req.headers.host || 'docs.easycarus.com';
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  return `${protocol}://${host}/api/calendar/feed?token=${encodeURIComponent(token)}`;
}

export default async function handler(req, res) {
  if (!['POST', 'DELETE'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' });
  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return json(res, 401, { error: auth.error });

    if (req.method === 'DELETE') {
      const { error } = await auth.supabase
        .from('doc_calendar_feed_tokens')
        .update({ active: false })
        .eq('user_id', auth.user.id);
      if (error) throw error;
      return json(res, 200, { ok: true });
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const { error } = await auth.supabase
      .from('doc_calendar_feed_tokens')
      .upsert({ user_id: auth.user.id, token_hash: tokenHash, active: true, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) throw error;

    return json(res, 200, {
      ok: true,
      feedUrl: feedUrl(req, token),
      calendarSettingsUrl: 'https://calendar.google.com/calendar/u/0/r/settings/addbyurl'
    });
  } catch (error) {
    return json(res, 500, { error: error.message || 'No se pudo preparar el calendario privado' });
  }
}
