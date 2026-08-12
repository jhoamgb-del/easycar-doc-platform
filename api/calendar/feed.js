import crypto from 'node:crypto';
import { adminClient } from '../_lib/supabase.js';

function escapeIcs(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function icsDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function foldLine(line) {
  const chunks = [];
  let remaining = String(line);
  while (Buffer.byteLength(remaining, 'utf8') > 70) {
    let index = Math.min(70, remaining.length);
    while (Buffer.byteLength(remaining.slice(0, index), 'utf8') > 70) index -= 1;
    chunks.push(remaining.slice(0, index));
    remaining = ` ${remaining.slice(index)}`;
  }
  chunks.push(remaining);
  return chunks.join('\r\n');
}

function eventLines(activity) {
  const start = new Date(activity.due_at);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const shortCase = String(activity.sale_id).slice(0, 8).toUpperCase();
  return [
    'BEGIN:VEVENT',
    `UID:${activity.id}@docs.easycarus.com`,
    `DTSTAMP:${icsDate(activity.updated_at || activity.created_at)}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${escapeIcs(`DOC EASYCAR - ${activity.title}`)}`,
    `DESCRIPTION:${escapeIcs(`Caso ${shortCase}. Abrir DOC EASYCAR y buscar el identificador del caso. https://docs.easycarus.com`)}`,
    `URL:https://docs.easycarus.com`,
    `STATUS:${activity.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Actividad pendiente en DOC EASYCAR',
    'END:VALARM',
    'END:VEVENT'
  ];
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).end('Method not allowed');
    return;
  }
  try {
    const token = String(req.query?.token || '');
    if (token.length < 32) throw new Error('Invalid calendar token');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const supabase = adminClient();
    const { data: connection, error: connectionError } = await supabase
      .from('doc_calendar_feed_tokens')
      .select('id, user_id, active, doc_user_profiles!inner(role, active)')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    if (connectionError || !connection?.active || !connection.doc_user_profiles?.active) {
      res.status(404).end('Calendar not found');
      return;
    }

    const role = connection.doc_user_profiles.role;
    let query = supabase
      .from('doc_activities')
      .select('id, sale_id, title, status, due_at, created_at, updated_at, assigned_to')
      .eq('status', 'pending')
      .order('due_at', { ascending: true })
      .limit(2000);
    if (!['admin', 'manager'].includes(role)) {
      query = query.eq('assigned_to', connection.user_id);
    }
    const { data: activities, error: activitiesError } = await query;
    if (activitiesError) throw activitiesError;

    await supabase
      .from('doc_calendar_feed_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', connection.id);

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//EASYCAR LLC//DOC EASYCAR//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:DOC EASYCAR - Actividades',
      'X-WR-TIMEZONE:America/New_York',
      ...(activities || []).flatMap(eventLines),
      'END:VCALENDAR'
    ];
    const body = `${lines.map(foldLine).join('\r\n')}\r\n`;
    res.status(200);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="doc-easycar-actividades.ics"');
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.end(body);
  } catch (error) {
    res.status(400).end('Calendar unavailable');
  }
}
