import { authenticateRequest, json, requireAdmin } from '../_lib/supabase.js';

async function listAllFiles(supabase, prefix = '') {
  const files = [];
  const { data, error } = await supabase.storage.from('easycar-documents').list(prefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
  if (error) throw error;
  for (const entry of data || []) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id) files.push(path);
    else files.push(...await listAllFiles(supabase, path));
  }
  return files;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  try {
    const auth = requireAdmin(await authenticateRequest(req));
    if (auth.error) return json(res, 403, { error: auth.error });
    const files = await listAllFiles(auth.supabase);
    const candidateSaleIds = [...new Set(files.map(path => path.split('/')[0]).filter(value => /^[0-9a-f-]{36}$/i.test(value)))];
    const { data: liveSales, error } = await auth.supabase.from('doc_sales').select('id').in('id', candidateSaleIds.length ? candidateSaleIds : ['00000000-0000-0000-0000-000000000000']);
    if (error) throw error;
    const liveIds = new Set((liveSales || []).map(sale => sale.id));
    const orphaned = files.filter(path => !liveIds.has(path.split('/')[0]));
    if (orphaned.length) {
      const { error: removeError } = await auth.supabase.storage.from('easycar-documents').remove(orphaned);
      if (removeError) throw removeError;
    }
    return json(res, 200, { removed: orphaned.length });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Unable to clean orphaned storage files' });
  }
}
