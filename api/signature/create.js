import { authenticateRequest, findAuthorizedSale, json } from '../_lib/supabase.js';

function docusealConfig() {
  const apiKey = process.env.DOCUSEAL_API_KEY;
  const templateId = Number(process.env.DOCUSEAL_TEMPLATE_ID);
  if (!apiKey || !templateId) throw new Error('DocuSeal is not configured');
  return {
    apiKey,
    templateId,
    apiUrl: (process.env.DOCUSEAL_API_URL || 'https://api.docuseal.com').replace(/\/$/, ''),
    customerRole: process.env.DOCUSEAL_CUSTOMER_ROLE || 'Customer'
  };
}

function field(name, value, options = {}) {
  return { name, default_value: value == null ? '' : String(value), readonly: true, ...options };
}

function docusealFields(form) {
  const customerName = [form.first_name, form.middle_name, form.last_name, form.second_last_name].filter(Boolean).join(' ');
  const vehicle = [form.vehicle_year, form.vehicle_make, form.vehicle_model].filter(Boolean).join(' ');
  const fields = [
    field('Customer Name', customerName),
    field('Customer Email', form.customer_email),
    field('Customer Phone', form.phone),
    field('Customer Address', form.address),
    field('City', form.city),
    field('State', form.state),
    field('ZIP Code', form.zip_code),
    field('Driver License', form.driver_license),
    field('Co-Buyer Name', form.co_buyer_name),
    field('Vehicle', vehicle),
    field('VIN', form.vin),
    field('Mileage', form.vehicle_mileage),
    field('Stock Number', form.stock_number),
    field('Contract Number', form.contract_number),
    field('Transaction Date', form.transaction_date),
    field('Sales Representative', form.sales_rep_name),
    field('Down Payment Total', form.pickup_down_total),
    field('Financed Down Payment', form.pickup_finance_amount),
    field('Payment Count', form.pickup_payment_count),
    field('Payment Frequency', form.pickup_frequency)
  ];

  for (let i = 1; i <= 12; i++) {
    fields.push(field(`Payment ${i} Date`, form[`pickup_date_${i}`]));
    fields.push(field(`Payment ${i} Amount`, form[`pickup_amount_${i}`]));
  }
  return fields;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return json(res, 401, { error: auth.error });

    const saleId = req.body?.saleId;
    if (!saleId) return json(res, 400, { error: 'saleId is required' });

    const authorized = await findAuthorizedSale(auth.supabase, auth.profile, saleId);
    if (authorized.error) return json(res, 404, { error: authorized.error });

    const sale = authorized.sale;
    const form = sale.form_data || {};
    const email = sale.customer_email || form.customer_email;
    const name = sale.customer_name || [form.first_name, form.last_name].filter(Boolean).join(' ');
    if (!email) return json(res, 400, { error: 'Customer email is required before sending' });

    const config = docusealConfig();
    const response = await fetch(`${config.apiUrl}/submissions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Token': config.apiKey
      },
      body: JSON.stringify({
        template_id: config.templateId,
        send_email: true,
        order: 'preserved',
        submitters: [{
          role: config.customerRole,
          email,
          name,
          external_id: sale.id,
          require_email_2fa: true,
          fields: docusealFields(form),
          message: {
            subject: 'EasyCar - Documents ready for your signature',
            body: 'Your EasyCar documents are ready. Review every page and sign securely here: {{submitter.link}}'
          }
        }]
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.message || 'DocuSeal request failed');

    const submitter = Array.isArray(payload) ? payload[0] : payload.submitters?.[0] || payload;
    const submissionId = String(submitter.submission_id || payload.id || '');
    const submitterId = submitter.id ? String(submitter.id) : null;
    const signingUrl = submitter.embed_src || submitter.url || (submitter.slug ? `https://docuseal.com/s/${submitter.slug}` : null);
    if (!submissionId) throw new Error('DocuSeal did not return a submission ID');

    const { data: requestRecord, error: requestError } = await auth.supabase
      .from('signing_requests')
      .insert({
        sale_id: sale.id,
        provider_submission_id: submissionId,
        provider_submitter_id: submitterId,
        signer_email: email,
        signer_name: name,
        signing_url: signingUrl,
        status: 'sent',
        sent_by: auth.user.id
      })
      .select('id')
      .single();
    if (requestError) throw requestError;

    await auth.supabase
      .from('sales')
      .update({ status: 'sent', signature_method: 'digital' })
      .eq('id', sale.id);

    return json(res, 200, {
      ok: true,
      requestId: requestRecord.id,
      submissionId,
      signingUrl,
      sentTo: email
    });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Unable to create signature request' });
  }
}
