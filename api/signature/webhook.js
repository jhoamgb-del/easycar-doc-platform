import crypto from 'node:crypto';
import { adminClient, json } from '../_lib/supabase.js';

export const config = { api: { bodyParser: false } };

async function rawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function safeEqual(a, b) {
  const left = Buffer.from(a || '');
  const right = Buffer.from(b || '');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifySignature(raw, header) {
  const secret = process.env.DOCUSEAL_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const [timestamp, suppliedRaw] = header.split('.', 2);
  const supplied = (suppliedRaw || '').replace(/^sha256=/, '');
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${raw.toString('utf8')}`).digest('hex');
  return safeEqual(expected, supplied);
}

function eventName(payload) {
  return payload.event_type || payload.event || payload.type || 'unknown';
}

function eventData(payload) {
  return payload.data || payload;
}

function findExternalId(data) {
  return data.external_id || data.submitter?.external_id || data.submitters?.find(item => item.external_id)?.external_id || null;
}

function submissionId(data) {
  return String(data.submission_id || data.submission?.id || data.submitter?.submission_id || data.id || '');
}

function mapStatus(name) {
  if (name.includes('completed')) return 'completed';
  if (name.includes('declined')) return 'declined';
  if (name.includes('viewed') || name.includes('started')) return 'opened';
  return null;
}

function safeFileName(value) {
  return String(value || 'signed-document').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

async function archiveSignedDocuments(supabase, saleId, requestId, providerSubmissionId) {
  const apiKey = process.env.DOCUSEAL_API_KEY;
  const apiUrl = (process.env.DOCUSEAL_API_URL || 'https://api.docuseal.com').replace(/\/$/, '');
  if (!apiKey) throw new Error('DOCUSEAL_API_KEY is missing');

  const response = await fetch(`${apiUrl}/submissions/${encodeURIComponent(providerSubmissionId)}/documents?merge=true`, {
    headers: { 'X-Auth-Token': apiKey }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Unable to download signed documents');

  for (const [index, document] of (payload.documents || []).entries()) {
    const fileResponse = await fetch(document.url);
    if (!fileResponse.ok) throw new Error('Unable to download a signed PDF');
    const bytes = Buffer.from(await fileResponse.arrayBuffer());
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    const name = `${String(index + 1).padStart(2, '0')}-${safeFileName(document.name)}.pdf`;
    const path = `${saleId}/digital/${requestId}/${name}`;

    const { error: uploadError } = await supabase.storage
      .from('easycar-documents')
      .upload(path, bytes, { contentType: 'application/pdf', upsert: true });
    if (uploadError) throw uploadError;

    const { error: documentError } = await supabase.from('doc_sale_documents').insert({
      sale_id: saleId,
      document_type: 'signed_digital',
      storage_path: path,
      original_name: document.name,
      mime_type: 'application/pdf',
      size_bytes: bytes.length,
      sha256: hash
    });
    if (documentError) throw documentError;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const raw = await rawBody(req);
  const signature = req.headers['x-docuseal-signature'];
  if (!verifySignature(raw, signature)) return json(res, 401, { error: 'Invalid webhook signature' });

  try {
    const payload = JSON.parse(raw.toString('utf8'));
    const data = eventData(payload);
    const type = eventName(payload);
    const providerSubmissionId = submissionId(data);
    const externalId = findExternalId(data);
    const supabase = adminClient();

    let requestQuery = supabase.from('doc_signing_requests').select('*');
    requestQuery = providerSubmissionId
      ? requestQuery.eq('provider_submission_id', providerSubmissionId)
      : requestQuery.eq('sale_id', externalId);
    const { data: requestRecord } = await requestQuery.maybeSingle();
    const saleId = requestRecord?.sale_id || externalId;

    await supabase.from('doc_signing_events').insert({
      signing_request_id: requestRecord?.id || null,
      sale_id: saleId || null,
      event_type: type,
      provider_event_id: payload.id ? String(payload.id) : null,
      payload
    });

    const status = mapStatus(type);
    if (requestRecord && status) {
      const changes = { status };
      if (status === 'opened') changes.opened_at = new Date().toISOString();
      if (status === 'completed') changes.completed_at = new Date().toISOString();
      if (status === 'declined') changes.declined_at = new Date().toISOString();
      await supabase.from('doc_signing_requests').update(changes).eq('id', requestRecord.id);
    }

    if (saleId && status === 'opened') {
      await supabase.from('doc_sales').update({ status: 'viewed' }).eq('id', saleId);
    }
    if (saleId && status === 'declined') {
      await supabase.from('doc_sales').update({ status: 'declined' }).eq('id', saleId);
    }
    if (saleId && status === 'completed' && requestRecord) {
      await archiveSignedDocuments(supabase, saleId, requestRecord.id, requestRecord.provider_submission_id);
      await supabase.from('doc_sales').update({ status: 'signed_digital', signature_method: 'digital' }).eq('id', saleId);
    }

    return json(res, 200, { ok: true });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Webhook processing failed' });
  }
}
