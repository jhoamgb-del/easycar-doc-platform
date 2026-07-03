import { authenticateRequest, findAuthorizedSale, json } from '../_lib/supabase.js';
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
    const html = renderDocusealHtml(form);
    const saleType = form.sale_type === 'BANCO' ? 'BANCO' : 'BHPH';
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
        submitters: [{
          role: config.customerRole,
          email,
          name,
          external_id: sale.id,
          reply_to: config.replyTo,
          require_email_2fa: true,
        }],
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

    const { data: requestRecord, error: requestError } = await auth.supabase
      .from('doc_signing_requests')
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
      .from('doc_sales')
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
