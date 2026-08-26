import { adminClient, json } from '../_lib/supabase.js';

function resendConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('Resend is not configured');
  return {
    apiKey,
    from: process.env.RESEND_FROM || 'EasyCar LLC <sales@easycarus.com>',
    notify: process.env.OVERDUE_REVIEW_NOTIFY_EMAIL || process.env.SIGNATURE_BCC_EMAIL || 'sales@easycarus.com'
  };
}

function isPastDue(dateStr) {
  if (!dateStr) return false;
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return parsed < today;
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.floor((Date.now() - parsed.getTime()) / 86400000);
}

function customerName(sale) {
  const form = sale.form_data || {};
  return sale.customer_name || [form.first_name, form.middle_name, form.last_name].filter(Boolean).join(' ') || 'Cliente sin nombre';
}

function overdueReasons(form) {
  const reasons = [];
  if (form.insurance_policy_number) {
    const insuranceOverdue = isPastDue(form.insurance_next_review_date)
      || (!form.insurance_next_review_date && (daysSince(form.insurance_first_review_date) ?? Infinity) > 14);
    if (insuranceOverdue) reasons.push('Revision de seguro vencida');
  }
  if (form.gps_imei) {
    const gpsOverdue = isPastDue(form.gps_next_review_date)
      || (!form.gps_next_review_date && (daysSince(form.gps_first_review_date) ?? Infinity) > 10);
    if (gpsOverdue) reasons.push('Revision de GPS vencida');
  }
  return reasons;
}

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return json(res, 500, { error: 'CRON_SECRET is not configured' });
  if (req.headers.authorization !== `Bearer ${cronSecret}`) return json(res, 401, { error: 'Unauthorized' });

  try {
    const supabase = adminClient();

    const { data: sales, error: salesError } = await supabase
      .from('doc_sales')
      .select('id, customer_name, customer_email, vehicle_description, vin, stock_number, form_data')
      .in('status', ['draft', 'ready', 'sent', 'viewed', 'signed_digital', 'signed_physical']);
    if (salesError) throw salesError;

    const overdueCases = (sales || [])
      .map(sale => ({ sale, reasons: overdueReasons(sale.form_data || {}) }))
      .filter(entry => entry.reasons.length);

    if (!overdueCases.length) return json(res, 200, { ok: true, overdueCount: 0, notified: 0 });

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { data: alreadyNotified, error: notifiedError } = await supabase
      .from('doc_sale_operations')
      .select('sale_id')
      .eq('event_type', 'recordatorio_revision_vencida')
      .gte('created_at', todayStart.toISOString())
      .in('sale_id', overdueCases.map(entry => entry.sale.id));
    if (notifiedError) throw notifiedError;
    const alreadyNotifiedIds = new Set((alreadyNotified || []).map(row => row.sale_id));
    const pendingCases = overdueCases.filter(entry => !alreadyNotifiedIds.has(entry.sale.id));

    if (!pendingCases.length) return json(res, 200, { ok: true, overdueCount: overdueCases.length, notified: 0 });

    const { data: actorProfile, error: actorError } = await supabase
      .from('doc_user_profiles')
      .select('id')
      .eq('role', 'admin')
      .eq('active', true)
      .limit(1)
      .maybeSingle();
    if (actorError) throw actorError;
    if (!actorProfile) return json(res, 500, { error: 'No active admin profile found to attribute the reminder to.' });

    const { error: insertError } = await supabase.from('doc_sale_operations').insert(
      pendingCases.map(entry => ({
        sale_id: entry.sale.id,
        module: 'insurance_gps',
        event_type: 'recordatorio_revision_vencida',
        status: 'Pendiente',
        note: `Recordatorio automatico: ${entry.reasons.join(', ')}.`,
        payload: { reasons: entry.reasons },
        created_by: actorProfile.id
      }))
    );
    if (insertError) throw insertError;

    const config = resendConfig();
    const rows = pendingCases.map(entry => `<tr><td>${customerName(entry.sale)}</td><td>${entry.sale.vehicle_description || ''}</td><td>${entry.sale.vin || ''}</td><td>${entry.reasons.join(', ')}</td></tr>`).join('');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: config.from,
        to: [config.notify],
        subject: `EasyCar - ${pendingCases.length} revision(es) de GPS/seguro vencida(s)`,
        html: [
          `<p>Estos expedientes tienen una revision de GPS o seguro vencida:</p>`,
          `<table border="1" cellpadding="6" cellspacing="0"><tr><th>Cliente</th><th>Vehiculo</th><th>VIN</th><th>Motivo</th></tr>${rows}</table>`,
          `<p>Revisalos en el Panel de Control de docs.easycarus.com.</p>`
        ].join('\n')
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || 'Resend request failed');

    return json(res, 200, { ok: true, overdueCount: overdueCases.length, notified: pendingCases.length });
  } catch (error) {
    return json(res, 500, { error: error.message || 'No se pudo enviar el recordatorio de revisiones vencidas' });
  }
}
