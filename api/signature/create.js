import { adminClient, authenticateRequest, findAuthorizedSale, json } from '../_lib/supabase.js';
import { renderDocusealFooter, renderDocusealHeader, renderDocusealHtml } from './document-html.js';

function docusealConfig() {
  const apiKey = process.env.DOCUSEAL_API_KEY;
  if (!apiKey) throw new Error('DocuSeal is not configured');
  const expireDays = Number(process.env.DOCUSEAL_EXPIRE_DAYS || 14);
  return {
    apiKey,
    apiUrl: (process.env.DOCUSEAL_API_URL || 'https://api.docuseal.com').replace(/\/$/, ''),
    customerRole: process.env.DOCUSEAL_CUSTOMER_ROLE || 'Customer',
    replyTo: process.env.DOCUSEAL_REPLY_TO || 'sales@easycarus.com',
    bccCompleted: process.env.DOCUSEAL_BCC_COMPLETED || 'sales@easycarus.com',
    sendSms: process.env.DOCUSEAL_SEND_SMS !== 'false',
    requirePhone2fa: process.env.DOCUSEAL_REQUIRE_PHONE_2FA !== 'false',
    requireEmail2fa: process.env.DOCUSEAL_REQUIRE_EMAIL_2FA === 'true',
    completedRedirectUrl: process.env.DOCUSEAL_COMPLETED_REDIRECT_URL || 'https://docs.easycarus.com/',
    expireDays: Number.isFinite(expireDays) && expireDays > 0 ? expireDays : 14
  };
}

function customerName(form) {
  return [form.first_name, form.middle_name, form.last_name, form.second_last_name].filter(Boolean).join(' ');
}

function normalizedPhone(form) {
  const candidates = [form.phone, form.alternate_phone].filter(Boolean);
  for (const candidate of candidates) {
    const matches = String(candidate).match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g) || [];
    for (const match of matches) {
      const digits = match.replace(/\D/g, '');
      if (digits.length === 10) return `+1${digits}`;
      if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    }
    const digits = String(candidate).replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  }
  return '';
}

function saleRecord(formData, ownerId) {
  const vehicle = [formData.vehicle_year, formData.vehicle_make, formData.vehicle_model].filter(Boolean).join(' ');
  return {
    created_by: ownerId,
    customer_name: customerName(formData),
    customer_email: formData.customer_email || null,
    customer_phone: formData.phone || null,
    vehicle_description: vehicle,
    vin: formData.vin || null,
    stock_number: formData.stock_number || null,
    contract_number: formData.contract_number || null,
    transaction_date: formData.transaction_date || null,
    status: 'draft',
    form_data: formData
  };
}

function parseMoneyValue(value) {
  return Number(String(value || '').replace(/[^0-9.-]/g, '')) || 0;
}

function requiredSignatureErrors(form) {
  const errors = [];
  const isVoluntary = form.sale_type === 'VOLUNTARY';
  const isRepo = form.sale_type === 'REPO';
  const required = [
    ['first_name', 'Nombre del cliente'],
    ['last_name', 'Apellido del cliente'],
    ['customer_email', 'Email del cliente'],
    ['driver_license', 'Licencia, pasaporte o ID'],
    ['vin', 'VIN'],
    ['vehicle_year', 'Año del vehiculo'],
    ['vehicle_make', 'Marca del vehiculo'],
    ['vehicle_model', 'Modelo del vehiculo'],
    ['vehicle_mileage', 'Millas del vehiculo'],
    ['transaction_date', 'Fecha de venta'],
    ['sales_rep_name', 'Nombre del vendedor']
  ];
  const paymentRequired = [
    ['pickup_down_total', 'Monto total de la inicial'],
    ['pickup_start_date', 'Fecha del primer pago'],
    ['pickup_payment_count', 'Tiempo/cantidad de pagos'],
    ['pickup_frequency', 'Frecuencia de pago'],
    ['pickup_interest_rate', 'Interes anual']
  ];
  const voluntaryRequired = [
    ['surrender_date', 'Fecha de entrega voluntaria'],
    ['surrender_location', 'Lugar de entrega voluntaria'],
    ['account_number', 'Numero de cuenta'],
    ['surrender_monthly_payment', 'Cuota mensual'],
    ['surrender_paid_installments', 'Cuotas pagadas'],
    ['surrender_owed_installments', 'Cuotas pendientes'],
    ['surrender_payoff', 'Payoff del carro']
  ];
  const repoRequired = [
    ['repo_date', 'Fecha de reposesion'],
    ['repo_location', 'Lugar de reposesion'],
    ['account_number', 'Numero de cuenta'],
    ['repo_past_due', 'Monto vencido'],
    ['repo_current_balance', 'Saldo actual'],
    ['repo_costs', 'Costos de repo/storage'],
    ['repo_payoff', 'Payoff del carro']
  ];
  required.push(...(isRepo ? repoRequired : isVoluntary ? voluntaryRequired : paymentRequired));
  for (const [key, label] of required) {
    if (!String(form[key] ?? '').trim()) errors.push(label);
  }
  if (!normalizedPhone(form)) errors.push('Telefono valido para codigo SMS');
  if (form.customer_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(form.customer_email))) errors.push('Email valido del cliente');
  if (!isVoluntary && !isRepo) {
    if (parseMoneyValue(form.pickup_down_total) <= 0) errors.push('Monto total de la inicial mayor que $0');
    const paymentCount = Number(form.pickup_payment_count);
    if (!Number.isFinite(paymentCount) || paymentCount < 1 || paymentCount > 14) errors.push('Cantidad de pagos entre 1 y 14');
    const interest = Number(form.pickup_interest_rate);
    if (!Number.isFinite(interest) || interest < 0 || interest > 30) errors.push('Interes anual entre 0% y 30%');
  }
  return [...new Set(errors)];
}

function docusealExpiration(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(23, 59, 0, 0);
  return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

async function defaultSellerId(supabase, replyTo) {
  const email = (process.env.EASYCAR_DEFAULT_SELLER_EMAIL || replyTo || 'sales@easycarus.com').toLowerCase();
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;

  const user = data.users.find(item => item.email?.toLowerCase() === email);
  if (!user) throw new Error(`No Supabase user found for ${email}. Sign in once with that email before sending public signatures.`);

  const { data: profile, error: profileError } = await supabase
    .from('doc_user_profiles')
    .select('id, active')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) throw profileError;

  if (!profile) {
    const { error: insertError } = await supabase
      .from('doc_user_profiles')
      .insert({ id: user.id, full_name: user.email || email, active: true });
    if (insertError) throw insertError;
  } else if (!profile.active) {
    const { error: updateError } = await supabase
      .from('doc_user_profiles')
      .update({ active: true })
      .eq('id', user.id);
    if (updateError) throw updateError;
  }

  return user.id;
}

async function createDocusealSubmission({ supabase, sale, sentBy }) {
  const form = sale.form_data || {};
  const email = sale.customer_email || form.customer_email;
  const name = sale.customer_name || customerName(form);
  if (!email) throw new Error('Customer email is required before sending');

  const config = docusealConfig();
  const html = renderDocusealHtml(form);
  const saleType = form.sale_type === 'REPO' ? 'REPO' : form.sale_type === 'VOLUNTARY' ? 'ENTREGA VOLUNTARIA' : form.sale_type === 'BANCO' ? 'BANCO' : 'BHPH';
  const phone = normalizedPhone(form);
  const missing = requiredSignatureErrors(form);
  if (missing.length) throw new Error(`Faltan datos obligatorios antes de enviar: ${missing.join(', ')}`);
  const customerSubmitter = {
    role: config.customerRole,
    email,
    name,
    external_id: sale.id,
    reply_to: config.replyTo,
    phone,
    send_sms: true,
    completed_redirect_url: config.completedRedirectUrl,
    require_phone_2fa: config.requirePhone2fa,
    require_email_2fa: config.requireEmail2fa,
    metadata: {
      sale_id: sale.id,
      sale_type: saleType,
      vin: form.vin || '',
      stock_number: form.stock_number || '',
      source: 'easycar-doc-platform'
    }
  };
  if (!config.sendSms) throw new Error('La verificacion por SMS esta desactivada en la configuracion');
  const response = await fetch(`${config.apiUrl}/submissions/html`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Token': config.apiKey
    },
    body: JSON.stringify({
      name: `EasyCar ${saleType} Document Package - ${name || sale.id}`,
      send_email: true,
      order: 'preserved',
      merge_documents: true,
      reply_to: config.replyTo,
      bcc_completed: config.bccCompleted,
      completed_redirect_url: config.completedRedirectUrl,
      expire_at: docusealExpiration(config.expireDays),
      documents: [{
        name: `EasyCar ${saleType} Document Package`,
        html,
        html_header: renderDocusealHeader(),
        html_footer: renderDocusealFooter(),
        size: 'Letter'
      }],
      send_sms: true,
      submitters: [customerSubmitter],
      message: {
        subject: `EasyCar - ${saleType} documents ready for secure signature`,
        body: [
          'Hello {{submitter.name}},',
          '',
          'Your EasyCar documents are ready for secure digital signature.',
          '',
          'Please review every page carefully and sign here:',
          '{{submitter.link}}',
          '',
          'For your protection, the signing process requires SMS verification using the phone number provided to EasyCar.',
          '',
          'If you have any questions, reply to this email or contact sales@easycarus.com.',
          '',
          'Thank you,',
          'EasyCar LLC'
        ].join('\n')
      }
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.message || 'DocuSeal request failed');

  const submitter = Array.isArray(payload) ? payload[0] : payload.submitters?.[0] || payload;
  const submissionId = String(submitter.submission_id || payload.id || '');
  const submitterId = submitter.id ? String(submitter.id) : null;
  const signingUrl = submitter.embed_src || submitter.url || (submitter.slug ? `https://docuseal.com/s/${submitter.slug}` : null);
  if (!submissionId) throw new Error('DocuSeal did not return a submission ID');
  if (!submitter.phone) {
    throw new Error(`DocuSeal did not confirm a phone number for SMS. Check that the customer phone is valid: ${phone}`);
  }
  if (submitter.preferences?.send_sms === false) {
    throw new Error('DocuSeal created the signature request, but SMS was not enabled by DocuSeal. Check that the EasyCar DocuSeal Pro account has SMS invitations enabled.');
  }

  const { data: requestRecord, error: requestError } = await supabase
    .from('doc_signing_requests')
    .insert({
      sale_id: sale.id,
      provider_submission_id: submissionId,
      provider_submitter_id: submitterId,
      signer_email: email,
      signer_name: name,
      signing_url: signingUrl,
      status: 'sent',
      sent_by: sentBy
    })
    .select('id')
    .single();
  if (requestError) throw requestError;

  await supabase
    .from('doc_sales')
    .update({ status: 'sent', signature_method: 'digital' })
    .eq('id', sale.id);

  return {
    ok: true,
    saleId: sale.id,
    requestId: requestRecord.id,
    submissionId,
    signingUrl,
    sentTo: email,
    smsTo: submitter.phone || phone,
    smsEnabled: submitter.preferences?.send_sms !== false,
    phone2faRequired: config.requirePhone2fa
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const saleId = req.body?.saleId;

    if (saleId) {
      const auth = await authenticateRequest(req);
      if (auth.error) return json(res, 401, { error: auth.error });

      const authorized = await findAuthorizedSale(auth.supabase, auth.profile, saleId);
      if (authorized.error) return json(res, 404, { error: authorized.error });

      const result = await createDocusealSubmission({
        supabase: auth.supabase,
        sale: authorized.sale,
        sentBy: auth.user.id
      });
      return json(res, 200, result);
    }

    const auth = await authenticateRequest(req);
    if (auth.error) return json(res, 401, { error: auth.error });

    const formData = req.body?.formData;
    if (!formData || typeof formData !== 'object') return json(res, 400, { error: 'formData is required' });
    const missing = requiredSignatureErrors(formData);
    if (missing.length) {
      return json(res, 400, { error: `Faltan datos obligatorios antes de enviar: ${missing.join(', ')}` });
    }

    const { data: sale, error: saleError } = await auth.supabase
      .from('doc_sales')
      .insert(saleRecord(formData, auth.user.id))
      .select('*')
      .single();
    if (saleError) throw saleError;

    const result = await createDocusealSubmission({
      supabase: auth.supabase,
      sale,
      sentBy: auth.user.id
    });
    return json(res, 200, result);
  } catch (error) {
    return json(res, 500, { error: error.message || 'Unable to create signature request' });
  }
}
