import { adminClient, authenticateRequest, findAuthorizedSale, json } from '../_lib/supabase.js';
import { renderDocusealFooter, renderDocusealHeader, renderDocusealHtml } from './document-html.js';

function docusealConfig() {
  const apiKey = process.env.DOCUSEAL_API_KEY;
  if (!apiKey) throw new Error('DocuSeal is not configured');
  return {
    apiKey,
    apiUrl: (process.env.DOCUSEAL_API_URL || 'https://api.docuseal.com').replace(/\/$/, ''),
    customerRole: process.env.DOCUSEAL_CUSTOMER_ROLE || 'Customer',
    replyTo: process.env.DOCUSEAL_REPLY_TO || 'sales@easycarus.com'
  };
}

function customerName(form) {
  return [form.first_name, form.middle_name, form.last_name, form.second_last_name].filter(Boolean).join(' ');
}

function normalizedPhone(form) {
  const digits = String(form.phone || form.alternate_phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
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
  const saleType = form.sale_type === 'BANCO' ? 'BANCO' : 'BHPH';
  const phone = normalizedPhone(form);
  const customerSubmitter = {
    role: config.customerRole,
    email,
    name,
    external_id: sale.id,
    reply_to: config.replyTo,
    require_email_2fa: true
  };
  if (phone) {
    customerSubmitter.phone = phone;
    customerSubmitter.send_sms = true;
    customerSubmitter.require_phone_2fa = true;
  }
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
      documents: [{
        name: `EasyCar ${saleType} Document Package`,
        html,
        html_header: renderDocusealHeader(),
        html_footer: renderDocusealFooter(),
        size: 'Letter'
      }],
      send_sms: Boolean(phone),
      submitters: [customerSubmitter],
      message: {
        subject: `EasyCar - ${saleType} documents ready for your signature`,
        body: 'Your EasyCar documents are ready. Review every page and sign securely here: {{submitter.link}}\n\nIf you have questions, reply to this email or contact sales@easycarus.com.'
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
    sentTo: email
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const saleId = req.body?.saleId;
    const config = docusealConfig();

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

    const formData = req.body?.formData;
    if (!formData || typeof formData !== 'object') return json(res, 400, { error: 'formData is required' });
    if (!formData.customer_email) return json(res, 400, { error: 'Customer email is required before sending' });

    const supabase = adminClient();
    const ownerId = await defaultSellerId(supabase, config.replyTo);
    const { data: sale, error: saleError } = await supabase
      .from('doc_sales')
      .insert(saleRecord(formData, ownerId))
      .select('*')
      .single();
    if (saleError) throw saleError;

    const result = await createDocusealSubmission({
      supabase,
      sale,
      sentBy: ownerId
    });
    return json(res, 200, result);
  } catch (error) {
    return json(res, 500, { error: error.message || 'Unable to create signature request' });
  }
}
