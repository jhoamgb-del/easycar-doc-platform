import { authenticateRequest, findAuthorizedSale, json } from '../_lib/supabase.js';

function resendConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('Resend is not configured');
  return {
    apiKey,
    from: process.env.RESEND_FROM || 'EasyCar LLC <sales@easycarus.com>',
    bcc: process.env.SIGNATURE_BCC_EMAIL || 'sales@easycarus.com'
  };
}

function customerName(sale) {
  const form = sale.form_data || {};
  return sale.customer_name || [form.first_name, form.middle_name, form.last_name, form.second_last_name].filter(Boolean).join(' ') || 'cliente';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return json(res, 401, { error: auth.error });

    const saleId = String(req.body?.saleId || '');
    const storagePath = String(req.body?.storagePath || '');
    if (!saleId || !storagePath) return json(res, 400, { error: 'saleId and storagePath are required' });

    const authorized = await findAuthorizedSale(auth.supabase, auth.profile, saleId);
    if (authorized.error) return json(res, 404, { error: authorized.error });
    const sale = authorized.sale;

    if (!sale.customer_email) return json(res, 422, { error: 'La venta no tiene un email de cliente registrado.' });
    if (!storagePath.startsWith(`${saleId}/physical/`)) return json(res, 400, { error: 'storagePath does not match this sale' });

    const config = resendConfig();

    const { data: fileData, error: downloadError } = await auth.supabase.storage
      .from('easycar-documents')
      .download(storagePath);
    if (downloadError) throw downloadError;
    const bytes = Buffer.from(await fileData.arrayBuffer());
    if (bytes.length > 15 * 1024 * 1024) return json(res, 413, { error: 'El documento firmado es demasiado grande para enviarlo por correo.' });
    const base64 = bytes.toString('base64');
    const fileName = storagePath.split('/').pop() || 'documento-firmado.pdf';

    const name = customerName(sale);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: config.from,
        to: [sale.customer_email],
        bcc: [config.bcc],
        subject: `EasyCar - Documentos firmados de su compra`,
        html: [
          `<p>Hola ${name},</p>`,
          `<p>Adjunto encontrara los documentos firmados de su compra en EasyCar LLC.</p>`,
          `<p>Si tiene alguna pregunta, responda este correo o contacte a sales@easycarus.com.</p>`,
          `<p>Gracias,<br>EasyCar LLC</p>`
        ].join('\n'),
        attachments: [{ filename: fileName, content: base64 }]
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      await auth.supabase.from('doc_sale_operations').insert({
        sale_id: saleId,
        module: 'bhph',
        event_type: 'Notificacion de firma fisica fallida',
        status: 'Fallido',
        note: 'Resend rechazo el envio del documento firmado fisicamente.',
        payload: { provider: 'resend', http_status: response.status, response: payload },
        created_by: auth.user.id
      });
      throw new Error(payload.message || payload.error || 'Resend request failed');
    }

    await auth.supabase.from('doc_sale_operations').insert({
      sale_id: saleId,
      module: 'bhph',
      event_type: 'Notificacion de firma fisica enviada',
      status: 'Completado',
      note: `Documentos firmados fisicamente enviados a ${sale.customer_email} y copia a ${config.bcc}.`,
      payload: { provider: 'resend', message_id: payload.id || null, to: sale.customer_email, bcc: config.bcc },
      created_by: auth.user.id
    });

    return json(res, 200, { ok: true, sentTo: sale.customer_email, bcc: config.bcc });
  } catch (error) {
    return json(res, 500, { error: error.message || 'No se pudo enviar la notificacion de firma fisica' });
  }
}
