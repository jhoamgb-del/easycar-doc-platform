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
  controls.badge.textContent = id ? `Guardada en Supabase: ${id.slice(0, 8)} - ${statusLabel(status)}` : 'Venta nueva sin guardar';
}

function setSessionUi(nextSession) {
  session = nextSession;
  const loggedIn = Boolean(session?.user);
  controls.auth.style.display = loggedIn ? 'none' : '';
  controls.user.classList.toggle('visible', loggedIn);
  controls.userEmail.textContent = loggedIn ? session.user.email : '';
  controls.newSale.disabled = false;
  controls.sendSignature.disabled = false;
  controls.sendSignature.title = loggedIn
    ? 'Enviar los documentos visibles al email del cliente'
    : 'Enviar al cliente ahora. EasyCar queda como contacto y expediente central.';
  controls.recent.hidden = !loggedIn;
  setCloudStatus(
    loggedIn
      ? 'Conectado a Supabase. Completa el email del cliente y usa Enviar firma digital al cliente.'
      : 'Puedes enviar la firma digital directo al cliente. El acceso del vendedor solo se usa para ver ventas centrales recientes.',
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

function normalizedPhone(formData) {
  const candidates = [formData.phone, formData.alternate_phone].filter(Boolean);
  for (const candidate of candidates) {
    const matches = String(candidate).match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g) || [];
    for (const match of matches) {
      const digits = match.replace(/\D/g, '');
      if (digits.length === 10 || (digits.length === 11 && digits.startsWith('1'))) return true;
    }
  }
  return false;
}

function moneyNumber(value) {
  return Number(String(value || '').replace(/[^0-9.-]/g, '')) || 0;
}

function markField(id, invalid) {
  const field = byId(id);
  if (!field) return;
  field.classList.toggle('field-error', invalid);
  field.setAttribute('aria-invalid', invalid ? 'true' : 'false');
}

function validateForSignature(formData) {
  const isVoluntary = formData.sale_type === 'VOLUNTARY';
  const required = [
    ['first_name', 'Nombre del cliente'],
    ['last_name', 'Apellido del cliente'],
    ['customer_email', 'Email del cliente'],
    ['phone', 'Telefono para codigo SMS'],
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
    ['surrender_payoff', 'Payoff estimado'],
    ['surrender_total', 'Total preliminar']
  ];
  required.push(...(isVoluntary ? voluntaryRequired : paymentRequired));
  const missing = [];
  const invalidIds = new Set();
  for (const [id, label] of required) {
    if (!String(formData[id] ?? '').trim()) {
      missing.push(label);
      invalidIds.add(id);
    }
  }
  if (formData.customer_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.customer_email)) {
    missing.push('Email valido del cliente');
    invalidIds.add('customer_email');
  }
  if (!normalizedPhone(formData)) {
    missing.push('Telefono valido para recibir SMS');
    invalidIds.add('phone');
  }
  if (!isVoluntary && moneyNumber(formData.pickup_down_total) <= 0) {
    missing.push('Monto total de la inicial mayor que $0');
    invalidIds.add('pickup_down_total');
  }
  const paymentCount = Number(formData.pickup_payment_count);
  if (!isVoluntary && (!Number.isFinite(paymentCount) || paymentCount < 1 || paymentCount > 14)) {
    missing.push('Cantidad de pagos entre 1 y 14');
    invalidIds.add('pickup_payment_count');
  }
  const interest = Number(formData.pickup_interest_rate);
  if (!isVoluntary && (!Number.isFinite(interest) || interest < 0 || interest > 30)) {
    missing.push('Interes anual entre 0% y 30%');
    invalidIds.add('pickup_interest_rate');
  }
  required.forEach(([id]) => markField(id, invalidIds.has(id)));
  return [...new Set(missing)];
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
  const formData = app.collectFormData();
  const missing = validateForSignature(formData);
  if (missing.length) {
    const firstInvalid = document.querySelector('.field-error');
    if (firstInvalid) firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
    throw new Error(`No se puede enviar todavia. Falta: ${missing.join(', ')}`);
  }
  const sale = session?.access_token ? await saveSale(formData) : null;

  const saleType = formData.sale_type === 'VOLUNTARY' ? 'REPO VOLUNTARY' : formData.sale_type === 'BANCO' ? 'BANCO' : 'BHPH';
  const approved = window.confirm(`Se enviaran los documentos ${saleType} al email ${formData.customer_email}. El codigo obligatorio de firma llegara por SMS al telefono ${formData.phone}. ¿Continuar?`);
  if (!approved) return;

  setCloudStatus('Creando expediente y enviando la solicitud al cliente...', '');
  controls.sendSignature.disabled = true;
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    const response = await fetch('/api/signature/create', {
      method: 'POST',
      headers,
      body: JSON.stringify(sale ? { saleId: sale.id } : { formData })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se pudo enviar para firma');
    setCurrentSale(result.saleId || sale?.id, 'sent');
    controls.signatureResult.replaceChildren();
    const text = document.createTextNode(`Firma digital enviada al cliente: ${result.sentTo}. EasyCar queda como contacto de respuesta. `);
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
    setCloudStatus('La solicitud fue enviada al cliente y el expediente quedo guardado para EasyCar.', 'good');
    if (session?.user) await loadRecentSales();
  } finally {
    controls.sendSignature.disabled = false;
  }
}

async function sendLoginLink() {
  const email = controls.sellerEmail.value.trim();
  if (!email) return setCloudStatus('Escribe el correo del vendedor para entrar al sistema.', 'error');
  controls.sendLogin.disabled = true;
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin }
    });
    if (error) throw error;
    setCloudStatus(`Enviamos un enlace de entrada al vendedor: ${email}. Abre ese correo para activar guardado y firma digital.`, 'good');
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
  setCloudStatus('Formulario limpio para una nueva venta. Completa los datos y envia al cliente cuando este listo.', 'good');
}

window.EasyCarCloud = { saveSale };

if (!configured) {
  controls.auth.style.display = 'none';
  setCloudStatus('Supabase no esta configurado en Vercel. Puedes llenar e imprimir, pero no guardar ni enviar firma digital.');
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
