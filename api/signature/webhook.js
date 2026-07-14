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
  if (!secret || !header) return { ok: false, reason: 'missing signature configuration' };
  const [timestamp, suppliedRaw] = header.split('.', 2);
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) return { ok: false, reason: 'invalid timestamp' };
  const timestampMs = timestampNumber > 1e12 ? timestampNumber : timestampNumber * 1000;
  const maxAgeMs = Number(process.env.DOCUSEAL_WEBHOOK_MAX_AGE_MS || 10 * 60 * 1000);
  if (Math.abs(Date.now() - timestampMs) > maxAgeMs) return { ok: false, reason: 'stale timestamp' };
  const supplied = (suppliedRaw || '').replace(/^sha256=/, '');
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${raw.toString('utf8')}`).digest('hex');
  return { ok: safeEqual(expected, supplied), reason: 'signature mismatch' };
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

function providerEventId(payload, raw, type, providerSubmissionId) {
  if (payload.id) return String(payload.id);
  return crypto
    .createHash('sha256')
    .update([providerSubmissionId || 'no-submission', type || 'unknown', raw.toString('utf8')].join('|'))
    .digest('hex');
}

function payloadSummary(payload, data, type, providerSubmissionId, externalId) {
  return {
    event_type: type,
    id: payload.id ? String(payload.id) : null,
    submission_id: providerSubmissionId || null,
    external_id: externalId || null,
    submitter_id: data.submitter?.id || data.id || null,
    submitter_email: data.submitter?.email || data.email || null,
    completed_at: data.completed_at || data.submission?.completed_at || null,
    declined_at: data.declined_at || data.submission?.declined_at || null,
    opened_at: data.opened_at || data.submission?.opened_at || null
  };
}

async function signedDocumentsArchived(supabase, saleId, requestId) {
  const { data, error } = await supabase
    .from('doc_sale_documents')
    .select('id')
    .eq('sale_id', saleId)
    .eq('document_type', 'signed_digital')
    .ilike('storage_path', `${saleId}/digital/${requestId}/%`)
    .limit(1);
  if (error) throw error;
  return Boolean(data?.length);
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

    const { data: existing, error: existingError } = await supabase
      .from('doc_sale_documents')
      .select('id')
      .eq('storage_path', path)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) continue;

    const { error: uploadError } = await supabase.storage
      .from('easycar-documents')
      .upload(path, bytes, { contentType: 'application/pdf', upsert: false });
    if (uploadError && uploadError.statusCode !== '409') throw uploadError;

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
  const verified = verifySignature(raw, signature);
  if (!verified.ok) return json(res, 401, { error: 'Invalid webhook signature' });

  try {
    const payload = JSON.parse(raw.toString('utf8'));
    const data = eventData(payload);
    const type = eventName(payload);
    const providerSubmissionId = submissionId(data);
    const externalId = findExternalId(data);
    const eventId = providerEventId(payload, raw, type, providerSubmissionId);
    const supabase = adminClient();

    let requestQuery = supabase.from('doc_signing_requests').select('*');
    requestQuery = providerSubmissionId
      ? requestQuery.eq('provider_submission_id', providerSubmissionId)
      : requestQuery.eq('sale_id', externalId);
    const { data: requestRecord } = await requestQuery.maybeSingle();
    const saleId = requestRecord?.sale_id || externalId;

    const { error: eventError } = await supabase.from('doc_signing_events').insert({
      signing_request_id: requestRecord?.id || null,
      sale_id: saleId || null,
      event_type: type,
      provider_event_id: eventId,
      payload: payloadSummary(payload, data, type, providerSubmissionId, externalId)
    });
    if (eventError?.code === '23505') return json(res, 200, { ok: true, duplicate: true });
    if (eventError) throw eventError;

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
      if (!(await signedDocumentsArchived(supabase, saleId, requestRecord.id))) {
        await archiveSignedDocuments(supabase, saleId, requestRecord.id, requestRecord.provider_submission_id);
      }
      const { error: saleError } = await supabase.from('doc_sales').update({ status: 'signed_digital', signature_method: 'digital' }).eq('id', saleId);
      if (saleError) throw saleError;
    }

    return json(res, 200, { ok: true });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Webhook processing failed' });
  }
}
