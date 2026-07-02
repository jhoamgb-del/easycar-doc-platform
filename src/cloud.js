import { createClient } from '@supabase/supabase-js';

const app = window.EasyCarApp;
const config = {
  url: import.meta.env.VITE_SUPABASE_URL || app?.supabaseConfig?.url || '',
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || app?.supabaseConfig?.anonKey || ''
};
const configured = /^https:\/\/.+\.supabase\.co$/.test(config.url) && Boolean(config.anonKey);
const supabase = configured ? createClient(config.url, config.anonKey) : null;

const byId = id => document.getElementById(id);
const controls = {
  status: byId('cloudStatus'),
  auth: byId('cloudAuth'),
  user: byId('cloudUser'),
  userEmail: byId('cloudUserEmail'),
  sellerEmail: byId('sellerEmail'),
  sendLogin: byId('sendLoginLink'),
  signOut: byId('signOutSeller'),
  newSale: byId('newCloudSale'),
  sendSignature: byId('sendForSignature'),
  badge: byId('cloudSaleBadge'),
  recent: byId('cloudRecent'),
  salesList: byId('cloudSalesList'),
  signatureResult: byId('signatureResult')
};

let session = null;
let currentSaleId = null;

function setCloudStatus(message, tone = '') {
  controls.status.textContent = message;
  controls.status.style.color = tone === 'error' ? '#9d1d28' : tone === 'good' ? '#087443' : '';
}

function setCurrentSale(id, status = 'draft') {
  currentSaleId = id || null;
  controls.badge.textContent = id ? `Expediente ${id.slice(0, 8)} - ${status}` : 'Sin expediente central';
}

function setSessionUi(nextSession) {
  session = nextSession;
  const loggedIn = Boolean(session?.user);
  controls.auth.style.display = loggedIn ? 'none' : '';
  controls.user.classList.toggle('visible', loggedIn);
  controls.userEmail.textContent = loggedIn ? session.user.email : '';
  controls.newSale.disabled = !loggedIn;
  controls.sendSignature.disabled = !loggedIn;
  controls.recent.hidden = !loggedIn;
  setCloudStatus(
    loggedIn
      ? 'Expediente central conectado. Las ventas y documentos quedan protegidos por usuario.'
      : 'Inicia sesion para guardar ventas y documentos en la nube.',
    loggedIn ? 'good' : ''
  );
  if (loggedIn) loadRecentSales();
}

function saleRecord(formData) {
  const customerName = [formData.first_name, formData.middle_name, formData.last_name, formData.second_last_name].filter(Boolean).join(' ');
  const vehicle = [formData.vehicle_year, formData.vehicle_make, formData.vehicle_model].filter(Boolean).join(' ');
  return {
    created_by: session.user.id,
    customer_name: customerName,
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

async function saveSale(formData) {
  if (!supabase || !session?.user) return null;
  const record = saleRecord(formData);
  const query = currentSaleId
    ? supabase.from('doc_sales').update(record).eq('id', currentSaleId)
    : supabase.from('doc_sales').insert(record);
  const { data, error } = await query.select('id, status').single();
  if (error) throw error;
  setCurrentSale(data.id, data.status);
  await loadRecentSales();
  return data;
}

async function loadSale(id) {
  const { data, error } = await supabase.from('doc_sales').select('*').eq('id', id).single();
  if (error) throw error;
  app.loadFormData(data.form_data);
  setCurrentSale(data.id, data.status);
  setCloudStatus(`Venta de ${data.customer_name || 'cliente'} abierta desde el expediente central.`, 'good');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function statusLabel(status) {
  const labels = {
    draft: 'Borrador', ready: 'Lista', sent: 'Enviada', viewed: 'Vista',
    signed_digital: 'Firmada digital', signed_physical: 'Firmada fisica',
    declined: 'Rechazada', void: 'Anulada'
  };
  return labels[status] || status;
}

async function loadRecentSales() {
  if (!supabase || !session?.user) return;
  const { data, error } = await supabase
    .from('doc_sales')
    .select('id, customer_name, vehicle_description, status, transaction_date')
    .order('created_at', { ascending: false })
    .limit(12);
  if (error) {
    setCloudStatus(`No se pudo cargar el historial central: ${error.message}`, 'error');
    return;
  }

  controls.salesList.replaceChildren();
  if (!data.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-history';
    empty.textContent = 'Todavia no hay ventas centrales.';
    controls.salesList.append(empty);
    return;
  }

  data.forEach(sale => {
    const row = document.createElement('div');
    row.className = 'cloud-sale-row';
    const customer = document.createElement('strong');
    customer.textContent = sale.customer_name || 'Cliente sin nombre';
    const vehicle = document.createElement('span');
    vehicle.textContent = sale.vehicle_description || 'Vehiculo sin completar';
    const status = document.createElement('span');
    status.textContent = statusLabel(sale.status);
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'secondary';
    open.textContent = 'Abrir';
    open.addEventListener('click', () => loadSale(sale.id).catch(error => setCloudStatus(error.message, 'error')));
    row.append(customer, vehicle, status, open);
    controls.salesList.append(row);
  });
}

async function sendForSignature() {
  if (!session?.access_token) throw new Error('Inicia sesion antes de enviar');
  const formData = app.collectFormData();
  if (!formData.customer_email) throw new Error('Agrega el correo del cliente antes de enviar');
  const sale = await saveSale(formData);
  if (!sale) throw new Error('La venta debe guardarse en el expediente central');

  const approved = window.confirm(`Se enviaran los documentos de esta venta a ${formData.customer_email} para firma digital. ¿Continuar?`);
  if (!approved) return;

  setCloudStatus('Creando enlace seguro y enviando la solicitud...', '');
  controls.sendSignature.disabled = true;
  try {
    const response = await fetch('/api/signature/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ saleId: sale.id })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se pudo enviar para firma');
    setCurrentSale(sale.id, 'sent');
    controls.signatureResult.replaceChildren();
    const text = document.createTextNode(`Solicitud enviada a ${result.sentTo}. `);
    controls.signatureResult.append(text);
    if (result.signingUrl) {
      const link = document.createElement('a');
      link.href = result.signingUrl;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Abrir enlace de firma';
      controls.signatureResult.append(link);
    }
    controls.signatureResult.classList.add('visible');
    setCloudStatus('La solicitud de firma digital fue enviada correctamente.', 'good');
    await loadRecentSales();
  } finally {
    controls.sendSignature.disabled = false;
  }
}

async function sendLoginLink() {
  const email = controls.sellerEmail.value.trim();
  if (!email) return setCloudStatus('Escribe el correo del vendedor.', 'error');
  controls.sendLogin.disabled = true;
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin }
    });
    if (error) throw error;
    setCloudStatus(`Enviamos un enlace de acceso a ${email}.`, 'good');
  } catch (error) {
    setCloudStatus(error.message, 'error');
  } finally {
    controls.sendLogin.disabled = false;
  }
}

function newSale() {
  setCurrentSale(null);
  app.clearForm();
  controls.signatureResult.classList.remove('visible');
  setCloudStatus('Nueva venta preparada. Completa los datos y guarda el expediente.', 'good');
}

window.EasyCarCloud = { saveSale };

if (!configured) {
  controls.auth.style.display = 'none';
  setCloudStatus('La estructura central esta preparada, pero faltan las credenciales de Supabase en Vercel.');
} else {
  controls.sendLogin.addEventListener('click', sendLoginLink);
  controls.signOut.addEventListener('click', async () => {
    await supabase.auth.signOut();
    setCurrentSale(null);
  });
  controls.newSale.addEventListener('click', newSale);
  controls.sendSignature.addEventListener('click', () => sendForSignature().catch(error => setCloudStatus(error.message, 'error')));

  const { data } = await supabase.auth.getSession();
  setSessionUi(data.session);
  supabase.auth.onAuthStateChange((_event, nextSession) => setSessionUi(nextSession));
}
