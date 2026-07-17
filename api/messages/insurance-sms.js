import { authenticateRequest, findAuthorizedSale, json } from '../_lib/supabase.js';

function normalizePhone(value) {
  const raw = String(value || '').trim().replace(/[^\d+]/g, '');
  if (!raw) return '';
  if (raw.startsWith('+')) return /^\+\d{8,15}$/.test(raw) ? raw : '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return '';
}

function messageForSale(sale) {
  const form = sale.form_data || {};
  const name = sale.customer_name || 'cliente';
  const vehicle = sale.vehicle_description || [form.vehicle_year, form.vehicle_make, form.vehicle_model].filter(Boolean).join(' ') || 'su vehiculo';
  const status = form.insurance_status === 'Cancelado' ? 'cancelada' : 'vencida';
  return `Hola ${name}, EasyCar LLC necesita actualizar la poliza de seguro de ${vehicle}. El estatus actual figura como ${status}. Por favor envie hoy una poliza activa con comprehensive, collision y EasyCar LLC como lien holder. Llame a EasyCar si necesita ayuda.`;
}

async function recordMessage(supabase, profile, sale, status, note, payload = {}) {
  const { error } = await supabase.from('doc_sale_operations').insert({
    sale_id: sale.id,
    module: 'insurance_gps',
    event_type: 'Aviso SMS de seguro',
    status,
    note,
    payload,
    created_by: profile.id
  });
  if (error) throw error;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return json(res, 401, { error: auth.error });
    const saleId = String(req.body?.saleId || '');
    const authorized = await findAuthorizedSale(auth.supabase, auth.profile, saleId);
    if (authorized.error) return json(res, 404, { error: authorized.error });
    const sale = authorized.sale;
    const form = sale.form_data || {};
    if (!['Cancelado', 'Vencido'].includes(form.insurance_status)) {
      return json(res, 422, { error: 'El SMS solo se prepara para una poliza cancelada o vencida.' });
    }
    const phone = normalizePhone(sale.customer_phone || form.phone);
    if (!phone) return json(res, 422, { error: 'El cliente necesita un telefono con codigo de pais, por ejemplo +1 305 555 1212.' });
    const body = messageForSale(sale);
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = normalizePhone(process.env.TWILIO_FROM_NUMBER);
    if (!sid || !token || !from) {
      await recordMessage(auth.supabase, auth.profile, sale, 'Preparado', 'SMS preparado; falta configurar Twilio en el servidor para entrega real.', { channel: 'sms', to: phone, body, delivery: 'not_configured' });
      return json(res, 202, { delivery: 'prepared', message: 'SMS preparado y asentado. Falta configurar Twilio para enviarlo.' });
    }
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ To: phone, From: from, Body: body })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      await recordMessage(auth.supabase, auth.profile, sale, 'Fallido', 'Twilio rechazo el SMS; revisar configuracion o telefono.', { channel: 'sms', to: phone, delivery: 'failed', provider_error: result?.message || 'Twilio error' });
      return json(res, 502, { error: result?.message || 'Twilio no pudo enviar el SMS.' });
    }
    await recordMessage(auth.supabase, auth.profile, sale, 'Enviado', 'SMS de seguro enviado por Twilio.', { channel: 'sms', to: phone, delivery: 'sent', provider_message_sid: result.sid });
    return json(res, 200, { delivery: 'sent', message: 'SMS enviado y registrado en el historial.' });
  } catch (error) {
    return json(res, 500, { error: error.message || 'No se pudo procesar el SMS.' });
  }
}
