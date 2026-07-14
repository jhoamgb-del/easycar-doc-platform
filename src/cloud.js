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
  sellerPassword: byId('sellerPassword'),
  sendLogin: byId('sendLoginLink'),
  requestPasswordReset: byId('requestPasswordReset'),
  passwordRecovery: byId('passwordRecovery'),
  recoveryPassword: byId('recoveryPassword'),
  recoveryPasswordConfirm: byId('recoveryPasswordConfirm'),
  saveRecoveredPassword: byId('saveRecoveredPassword'),
  signOut: byId('signOutSeller'),
  newSale: byId('newCloudSale'),
  sendSignature: byId('sendForSignature'),
  badge: byId('cloudSaleBadge'),
  recent: byId('cloudRecent'),
  salesList: byId('cloudSalesList'),
  archive: byId('archivePanel'),
  archiveSearch: byId('archiveSearch'),
  searchArchive: byId('searchArchive'),
  exportCustomers: byId('exportCustomersCsv'),
  archiveResults: byId('archiveResults'),
  importPanel: byId('importPanel'),
  importFile: byId('bulkImportFile'),
  importRun: byId('runBulkImport'),
  importTemplate: byId('downloadImportTemplate'),
  importStatus: byId('bulkImportStatus'),
  opsReport: byId('opsReportPanel'),
  opsSummary: byId('opsSummary'),
  opsOperatorSummary: byId('opsOperatorSummary'),
  opsSearch: byId('opsSearch'),
  clearOpsSearch: byId('clearOpsSearch'),
  opsResults: byId('opsResults'),
  operationHistory: byId('operationHistory'),
  signatureResult: byId('signatureResult'),
  adminPanel: byId('adminPanel'),
  adminUserEmail: byId('adminUserEmail'),
  adminUserName: byId('adminUserName'),
  adminUserRole: byId('adminUserRole'),
  adminUserPassword: byId('adminUserPassword'),
  adminCreateUser: byId('adminCreateUser'),
  adminInviteUser: byId('adminInviteUser'),
  adminUsers: byId('adminUsers')
};

let session = null;
let currentSaleId = null;
let opsFilter = 'all';
let autosaveTimer = null;

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
  document.body.dataset.auth = loggedIn ? 'signed-in' : 'signed-out';
  controls.auth.style.display = loggedIn ? 'none' : '';
  controls.user.classList.toggle('visible', loggedIn);
  controls.userEmail.textContent = loggedIn ? session.user.email : '';
  controls.newSale.disabled = !loggedIn;
  controls.sendSignature.disabled = !loggedIn;
  controls.sendSignature.title = loggedIn
    ? 'Enviar los documentos visibles al email del cliente'
    : 'Entra con un correo autorizado para llenar documentos y enviar firma digital.';
  controls.recent.hidden = !loggedIn;
  controls.archive.hidden = !loggedIn;
  controls.importPanel.hidden = !loggedIn;
  controls.opsReport.hidden = !loggedIn;
  controls.adminPanel.hidden = true;
  setCloudStatus(
    loggedIn
      ? 'Conectado a Supabase. Completa el email del cliente y usa Enviar firma digital al cliente.'
      : 'Acceso privado para empleados. Entra con un correo autorizado de EasyCar para ver formatos, guardar expedientes y enviar firma digital.',
    loggedIn ? 'good' : ''
  );
  if (loggedIn) {
    loadRecentSales();
    loadArchive();
    loadOpsReport();
    loadAdminUsers();
  }
}

function normalizePhoneForSms(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const compact = raw.replace(/[^\d+]/g, '');
  if (compact.startsWith('+')) {
    const digits = compact.slice(1).replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : '';
  }
  if (compact.startsWith('00')) {
    const digits = compact.slice(2).replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : '';
  }
  const digits = compact.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return '';
}

function withNormalizedPhones(formData) {
  return {
    ...formData,
    phone: normalizePhoneForSms(formData.phone) || formData.phone || '',
    alternate_phone: normalizePhoneForSms(formData.alternate_phone) || formData.alternate_phone || ''
  };
}

function saleRecord(formData) {
  formData = withNormalizedPhones(formData);
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
  return candidates.some(candidate => Boolean(normalizePhoneForSms(candidate)));
}

function hasCountryCode(value) {
  return /^\+\d{8,15}$/.test(String(value || '').replace(/[\s().-]/g, ''));
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
  if (formData.active_module === 'INSURANCE_GPS') {
    return ['Estas en el modulo GPS Y SEGURO. Para enviar documentos de firma, selecciona BHPH, BANCO, ENTREGA VOLUNTARIA o REPOSICION.'];
  }
  const isVoluntary = formData.sale_type === 'VOLUNTARY';
  const isRepo = formData.sale_type === 'REPO';
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
  if (!normalizedPhone(formData) || !hasCountryCode(formData.phone)) {
    missing.push('Telefono con codigo de pais, por ejemplo +1 305 555 1212');
    invalidIds.add('phone');
  }
  if (!isVoluntary && !isRepo && moneyNumber(formData.pickup_down_total) <= 0) {
    missing.push('Monto total de la inicial mayor que $0');
    invalidIds.add('pickup_down_total');
  }
  const paymentCount = Number(formData.pickup_payment_count);
  if (!isVoluntary && !isRepo && (!Number.isFinite(paymentCount) || paymentCount < 1 || paymentCount > 14)) {
    missing.push('Cantidad de pagos entre 1 y 14');
    invalidIds.add('pickup_payment_count');
  }
  const interest = Number(formData.pickup_interest_rate);
  if (!isVoluntary && !isRepo && (!Number.isFinite(interest) || interest < 0 || interest > 30)) {
    missing.push('Interes anual entre 0% y 30%');
    invalidIds.add('pickup_interest_rate');
  }
  required.forEach(([id]) => markField(id, invalidIds.has(id)));
  return [...new Set(missing)];
}

async function saveSale(formData, { quiet = false } = {}) {
  if (!supabase || !session?.user) return null;
  formData = withNormalizedPhones(formData);
  const record = saleRecord(formData);
  let query;
  if (currentSaleId) {
    const { created_by, status, ...updateRecord } = record;
    query = supabase.from('doc_sales').update(updateRecord).eq('id', currentSaleId);
  } else {
    query = supabase.from('doc_sales').insert(record);
  }
  const { data, error } = await query.select('id, status').single();
  if (error) throw error;
  setCurrentSale(data.id, data.status);
  if (!quiet) {
    await loadRecentSales();
    await loadArchive();
    await loadOpsReport();
  }
  return data;
}

function scheduleAutoSave(formData) {
  if (!supabase || !session?.user) return;
  const hasIdentity = [formData.vin, formData.first_name, formData.last_name, formData.customer_email, formData.phone].some(value => String(value || '').trim());
  if (!hasIdentity) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = window.setTimeout(() => {
    saveSale(formData, { quiet: true })
      .then(() => app.setSaveStatus?.('Cambios guardados automaticamente en el expediente central.', 'good'))
      .catch(error => app.setSaveStatus?.(`No se pudo guardar automaticamente: ${error.message}`, 'warn'));
  }, 1100);
}

function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const source = String(text || '').replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field.trim());
      field = '';
    } else if (char === '\n') {
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

const importAliases = {
  first_name: ['nombre', 'firstname', 'primer nombre', 'primernombre', 'name'],
  middle_name: ['segundo nombre', 'segundonombre', 'middlename'],
  last_name: ['apellido', 'lastname', 'primer apellido', 'primerapellido'],
  second_last_name: ['segundo apellido', 'segundoapellido'],
  customer_email: ['email', 'correo', 'correo electronico', 'customeremail'],
  phone: ['telefono', 'phone', 'celular', 'mobile'],
  alternate_phone: ['telefono alterno', 'alternatephone'],
  address: ['direccion', 'address'],
  city: ['ciudad', 'city'],
  state: ['estado', 'state'],
  zip_code: ['zip', 'zipcode', 'codigo postal', 'codigopostal'],
  driver_license: ['licencia', 'license', 'driverlicense', 'id'],
  vin: ['vin', 'vehiclevin'],
  vehicle_year: ['ano', 'anio', 'year', 'vehicleyear'],
  vehicle_make: ['marca', 'make', 'vehiclemake'],
  vehicle_model: ['modelo', 'model', 'vehiclemodel'],
  vehicle_mileage: ['millas', 'mileage', 'odometer', 'vehiclemileage'],
  vehicle_color: ['color'],
  vehicle_plate: ['placa', 'tag', 'plate'],
  stock_number: ['stock', 'stocknumber'],
  contract_number: ['contrato', 'contract', 'contractnumber', 'account'],
  transaction_date: ['fecha venta', 'fechaventa', 'sale date', 'saledate', 'transactiondate'],
  record_loaded_date: ['fecha carga', 'fecha_carga', 'fechacarga', 'loaded date', 'loaddate', 'recordloadeddate'],
  vehicle_loaded_date: ['fecha carga carro', 'fechacargacarro', 'vehicleloaddate'],
  insurance_provider: ['seguro', 'aseguradora', 'insuranceprovider'],
  insurance_policy_number: ['poliza', 'policy', 'policynumber', 'insurancepolicynumber'],
  insurance_expiration_date: ['vence poliza', 'vencimiento poliza', 'insuranceexpirationdate'],
  gps_imei: ['gps', 'imei', 'gpsimei'],
  gps_provider: ['proveedor gps', 'gpsprovider'],
  gps_last_location: ['ubicacion gps', 'ultima ubicacion', 'gpslocation'],
  gps_location_jurisdiction: ['estado ubicacion gps', 'ubicacion florida', 'gpslocationjurisdiction'],
  gps_service_expiration_date: ['vence servicio gps', 'vencimiento gps', 'gpsserviceexpirationdate'],
  gps_monthly_miles: ['millas mensuales gps', 'millas periodo gps', 'gpsmonthlymiles'],
  gap_has_coverage: ['gap', 'tiene gap', 'gapcoverage']
};

function importValue(row, headerMap, field) {
  const aliases = [field, ...(importAliases[field] || [])].map(normalizeHeader);
  for (const alias of aliases) {
    const index = headerMap.get(alias);
    if (index !== undefined) return row[index] || '';
  }
  return '';
}

function inputDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`;
  const us = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (us) {
    const year = us[3].length === 2 ? `20${us[3]}` : us[3];
    return `${year}-${String(us[1]).padStart(2, '0')}-${String(us[2]).padStart(2, '0')}`;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDaysInput(dateValue, days) {
  const date = inputDate(dateValue);
  if (!date) return '';
  const parsed = new Date(`${date}T00:00:00`);
  parsed.setDate(parsed.getDate() + days);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function yesNoGap(value) {
  const normalized = normalizeHeader(value);
  if (['si', 'yes', 'y', 'true', '1'].includes(normalized)) return 'Si';
  if (['no', 'false', '0'].includes(normalized)) return 'No';
  return value ? 'No confirmado' : '';
}

function formDataFromImport(row, headerMap) {
  const data = {};
  Object.keys(importAliases).forEach(field => {
    data[field] = importValue(row, headerMap, field);
  });
  const fullName = importValue(row, headerMap, 'full_name') || importValue(row, headerMap, 'cliente') || importValue(row, headerMap, 'customer_name');
  if (fullName && !data.first_name && !data.last_name) {
    const parts = fullName.split(/\s+/).filter(Boolean);
    data.first_name = parts.shift() || '';
    data.last_name = parts.join(' ');
  }
  data.vin = cleanVin(data.vin);
  data.phone = normalizePhoneForSms(data.phone) || data.phone;
  data.alternate_phone = normalizePhoneForSms(data.alternate_phone) || data.alternate_phone;
  data.vehicle_year = String(data.vehicle_year || '').replace(/\D/g, '').slice(0, 4);
  data.transaction_date = inputDate(data.transaction_date);
  data.record_loaded_date = inputDate(data.record_loaded_date) || new Date().toISOString().slice(0, 10);
  data.insurance_expiration_date = inputDate(data.insurance_expiration_date);
  data.sale_type = 'BHPH';
  data.active_module = 'SALE';
  data.vehicle_loaded_date = importValue(row, headerMap, 'vehicle_loaded_date') || data.record_loaded_date || data.transaction_date;
  data.vehicle_loaded_date = inputDate(data.vehicle_loaded_date);
  data.insurance_first_review_date = data.vehicle_loaded_date || data.transaction_date;
  data.gps_first_review_date = data.vehicle_loaded_date || data.transaction_date;
  data.insurance_next_review_date = addDaysInput(data.insurance_first_review_date, 14);
  data.gps_next_review_date = addDaysInput(data.gps_first_review_date, 10);
  data.gap_has_coverage = yesNoGap(data.gap_has_coverage);
  data.insurance_status = data.insurance_policy_number ? 'Pendiente' : '';
  data.gps_device_status = data.gps_imei ? 'No verificado' : '';
  const monthlyMiles = Number(String(data.gps_monthly_miles || '').replace(/[^0-9.]/g, ''));
  if (Number.isFinite(monthlyMiles) && monthlyMiles > 0) {
    data.gps_monthly_miles_status = monthlyMiles > 1500 ? 'Sobre 1500 millas' : 'Dentro de limite';
  }
  return data;
}

async function importSalesFromCsv(file) {
  if (!supabase || !session?.user) throw new Error('Debes entrar con usuario autorizado antes de importar.');
  if (!file) throw new Error('Selecciona un archivo CSV.');
  const rows = parseCsv(await file.text());
  if (rows.length < 2) throw new Error('El CSV debe tener encabezados y al menos una fila.');
  const headers = rows[0].map(normalizeHeader);
  const headerMap = new Map(headers.map((header, index) => [header, index]));
  const imported = rows.slice(1).map(row => formDataFromImport(row, headerMap)).filter(data => {
    const name = [data.first_name, data.last_name].filter(Boolean).join(' ');
    return data.vin || name || data.customer_email || data.phone;
  });
  if (!imported.length) throw new Error('No encontre filas con cliente o VIN para cargar.');

  const vins = [...new Set(imported.map(row => row.vin).filter(Boolean))];
  const existingVins = new Set();
  if (vins.length) {
    const { data, error } = await supabase.from('doc_sales').select('vin').in('vin', vins);
    if (error) throw error;
    (data || []).forEach(item => {
      if (item.vin) existingVins.add(cleanVin(item.vin));
    });
  }

  const records = imported
    .filter(formData => !formData.vin || !existingVins.has(formData.vin))
    .map(formData => saleRecord(formData));
  if (!records.length) return { inserted: 0, skipped: imported.length };

  const { error } = await supabase.from('doc_sales').insert(records);
  if (error) throw error;
  await loadRecentSales();
  await loadArchive();
  await loadOpsReport();
  return { inserted: records.length, skipped: imported.length - records.length };
}

function downloadImportTemplate() {
  const headers = [
    'nombre', 'apellido', 'telefono', 'email', 'direccion', 'ciudad', 'estado', 'zip',
    'VIN', 'ano', 'marca', 'modelo', 'millas', 'color', 'placa', 'stock',
    'contrato', 'fecha_venta', 'fecha_carga', 'seguro', 'poliza', 'vence_poliza',
    'gps_imei', 'proveedor_gps', 'ubicacion_gps', 'estado_ubicacion_gps', 'vence_servicio_gps', 'millas_mensuales_gps', 'gap'
  ];
  const example = [
    'JUAN', 'PEREZ', '3055551212', 'cliente@email.com', '123 Main St', 'Miami', 'FL', '33169',
    '3KPFK4A78HE069822', '2017', 'KIA', 'Forte', '123000', 'BLUE', 'ABC123', 'EC12362',
    '2026-40', '2026-07-07', '2026-07-13', 'Progressive', 'POL12345', '2026-08-07',
    '867530900000000', 'Proveedor GPS', 'Miami, FL', 'Dentro de Florida', '2027-07-13', '850', 'Si'
  ];
  const csv = `${headers.join(',')}\n${example.join(',')}\n`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'DOC_EASYCAR_plantilla_carga_clientes.csv';
  link.click();
  URL.revokeObjectURL(url);
}

const insuranceGpsFields = [
  'record_loaded_date', 'vehicle_loaded_date', 'insurance_first_review_date', 'gps_first_review_date',
  'insurance_provider', 'insurance_policy_number', 'insurance_agency_phone',
  'insurance_issue_date', 'insurance_address_matches', 'insurance_policy_address', 'insurance_cancelled_since',
  'insurance_status', 'insurance_verified_date', 'insurance_next_review_date',
  'insurance_expiration_date', 'insurance_payments_current',
  'insurance_comprehensive', 'insurance_collision', 'insurance_lienholder', 'insurance_status_reason',
  'gps_imei', 'gps_provider',
  'gps_device_status', 'gps_battery_connected',
  'gps_last_mileage', 'gps_last_location', 'gps_location_jurisdiction', 'gps_last_seen_at', 'gps_overnight_location', 'gps_status_reason',
  'gps_service_expiration_date', 'gps_next_review_date', 'gps_monthly_miles', 'gps_monthly_miles_status',
  'recovery_event_type', 'recovery_event_date', 'recovery_last_location',
  'recovery_policy_active_on_event', 'recovery_damage_notes',
  'gap_has_coverage', 'gap_provider', 'gap_contract_number', 'gap_issued_vin',
  'gap_vin_match', 'gap_issue_date', 'gap_contract_status',
  'gap_claim_status', 'insurance_claim_number', 'gap_claim_number', 'gap_opened_date',
  'insurance_claim_last_call_date', 'gap_last_call_date', 'claim_pending_action', 'gap_missing_documents',
  'ops_action_type', 'ops_contact_result',
  'ops_next_action', 'insurance_gps_notes'
];

function insuranceGpsPayload(formData) {
  return insuranceGpsFields.reduce((payload, field) => {
    payload[field] = formData[field] || '';
    return payload;
  }, {
    customer_name: [formData.first_name, formData.middle_name, formData.last_name, formData.second_last_name].filter(Boolean).join(' '),
    customer_phone: formData.phone || '',
    customer_email: formData.customer_email || '',
    vehicle: [formData.vehicle_year, formData.vehicle_make, formData.vehicle_model].filter(Boolean).join(' '),
    vin: formData.vin || '',
    stock_number: formData.stock_number || '',
    contract_number: formData.contract_number || '',
    transaction_date: formData.transaction_date || ''
  });
}

async function saveInsuranceGpsReview(formData) {
  if (!supabase || !session?.user) return null;
  if (!formData.ops_action_type) throw new Error('Selecciona la accion del operador antes de registrar.');
  if (!formData.ops_contact_result) throw new Error('Selecciona el resultado de la accion antes de registrar.');
  if (String(formData.insurance_gps_notes || '').trim().length < 12) {
    throw new Error('La nota de auditoria debe explicar que se verifico y que queda pendiente.');
  }
  const isInsuranceAction = ['Verificacion seguro', 'Llamada seguro'].includes(formData.ops_action_type);
  const isGpsAction = ['Verificacion GPS', 'Revision GPS'].includes(formData.ops_action_type);
  const gpsIssue = !formData.gps_imei
    || ['No instalado', 'No verificado', 'Expirado', 'Desconectado', 'Sin senal', 'Removido / alterado', 'No localizado'].includes(formData.gps_device_status)
    || ['No', 'No confirmado'].includes(formData.gps_battery_connected)
    || formData.gps_location_jurisdiction === 'Fuera de Florida'
    || formData.gps_location_jurisdiction === 'Por confirmar'
    || formData.gps_monthly_miles_status === 'Sobre 1500 millas'
    || isPastDue(formData.gps_service_expiration_date);
  const insuranceIssue = !formData.insurance_policy_number
    || ['Pendiente', 'Cancelada', 'Anulada', 'Vencida', 'Reposicion', 'No verificable'].includes(formData.insurance_status)
    || ['No', 'No confirmado'].includes(formData.insurance_payments_current)
    || ['No', 'No confirmado'].includes(formData.insurance_comprehensive)
    || ['No', 'No confirmado'].includes(formData.insurance_collision)
    || ['No', 'No confirmado'].includes(formData.insurance_lienholder)
    || formData.insurance_address_matches === 'No confirmado'
    || isPastDue(formData.insurance_expiration_date);
  if (((isInsuranceAction && insuranceIssue) || (isGpsAction && gpsIssue)) && !String(formData.ops_next_action || '').trim()) {
    throw new Error('Hay una irregularidad de seguro o GPS. Define la proxima accion del operador.');
  }
  if (isInsuranceAction && insuranceIssue && !String(formData.insurance_status_reason || '').trim()) {
    throw new Error('Explica el motivo o resultado de la verificacion de poliza.');
  }
  if (isGpsAction && gpsIssue && !String(formData.gps_status_reason || '').trim()) {
    throw new Error('Explica el motivo o seguimiento requerido para la alerta GPS.');
  }
  if (['Cancelada', 'Anulada'].includes(formData.insurance_status) && !formData.insurance_cancelled_since) {
    throw new Error('Indica desde que fecha la poliza esta cancelada o anulada.');
  }
  if (formData.insurance_status === 'Reposicion') {
    if (!formData.recovery_event_date || !formData.recovery_last_location || !formData.recovery_policy_active_on_event) {
      throw new Error('Para reposicion registra fecha, ultima ubicacion y si la poliza estaba activa el dia del repo.');
    }
  }
  const sale = await saveSale(formData);
  const payload = insuranceGpsPayload(formData);
  const status = formData.ops_contact_result || formData.insurance_status || formData.gps_device_status || formData.gap_claim_status || 'Registrado';
  const followUpAt = isInsuranceAction ? formData.insurance_next_review_date : isGpsAction ? formData.gps_next_review_date : formData.insurance_next_review_date || formData.gps_next_review_date || null;
  const rows = [{
    sale_id: sale.id,
    module: 'insurance_gps',
    event_type: formData.ops_action_type || formData.recovery_event_type || 'revision_realizada',
    status,
    follow_up_at: followUpAt,
    note: formData.insurance_gps_notes || null,
    payload,
    created_by: session.user.id
  }];
  const scheduledTypes = [];
  if (formData.insurance_next_review_date) scheduledTypes.push('proxima_revision_seguro');
  if (formData.gps_next_review_date) scheduledTypes.push('proxima_revision_gps');
  if (scheduledTypes.length) {
    const { error: clearScheduleError } = await supabase
      .from('doc_sale_operations')
      .delete()
      .eq('sale_id', sale.id)
      .eq('module', 'insurance_gps')
      .in('event_type', scheduledTypes)
      .eq('status', 'Pendiente');
    if (clearScheduleError) throw clearScheduleError;
  }
  if (formData.insurance_next_review_date) {
    rows.push({
      sale_id: sale.id,
      module: 'insurance_gps',
      event_type: 'proxima_revision_seguro',
      status: 'Pendiente',
      follow_up_at: formData.insurance_next_review_date,
      note: 'Accion automatica: verificar poliza, comprehensive, collision, pagos al dia y EasyCar como lien holder.',
      payload,
      created_by: session.user.id
    });
  }
  if (formData.gps_next_review_date) {
    rows.push({
      sale_id: sale.id,
      module: 'insurance_gps',
      event_type: 'proxima_revision_gps',
      status: 'Pendiente',
      follow_up_at: formData.gps_next_review_date,
      note: 'Accion automatica: verificar GPS activo, conexion a bateria, millas, ubicacion y senal.',
      payload,
      created_by: session.user.id
    });
  }
  const { data, error } = await supabase
    .from('doc_sale_operations')
    .insert(rows)
    .select('id, created_at')
    .limit(1);
  if (error) throw error;
  await loadSaleOperationHistory(sale.id);
  await loadArchive();
  await loadOpsReport();
  return data?.[0] || null;
}

async function loadSale(id) {
  const { data, error } = await supabase.from('doc_sales').select('*').eq('id', id).single();
  if (error) throw error;
  app.loadFormData(data.form_data);
  setCurrentSale(data.id, data.status);
  await loadSaleOperationHistory(data.id);
  setCloudStatus(`Venta de ${data.customer_name || 'cliente'} abierta desde el expediente central.`, 'good');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadSaleOperationHistory(saleId) {
  if (!controls.operationHistory || !saleId) return;
  controls.operationHistory.replaceChildren();
  const { data, error } = await supabase
    .from('doc_sale_operations')
    .select('event_type, status, follow_up_at, note, created_at, created_by')
    .eq('sale_id', saleId)
    .eq('module', 'insurance_gps')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    const message = document.createElement('p');
    message.className = 'empty-history';
    message.textContent = 'El historial operativo aun no esta disponible para este expediente.';
    controls.operationHistory.append(message);
    return;
  }
  if (!(data || []).length) {
    const empty = document.createElement('p');
    empty.className = 'empty-history';
    empty.textContent = 'Todavia no hay verificaciones ni seguimientos registrados.';
    controls.operationHistory.append(empty);
    return;
  }
  const operatorIds = [...new Set((data || []).map(operation => operation.created_by).filter(Boolean))];
  const operatorNames = new Map();
  if (operatorIds.length) {
    const { data: profiles } = await supabase
      .from('doc_user_profiles')
      .select('id, full_name')
      .in('id', operatorIds);
    (profiles || []).forEach(profile => operatorNames.set(profile.id, profile.full_name || 'Usuario sin nombre'));
  }
  (data || []).forEach(operation => {
    const row = document.createElement('div');
    row.className = 'ops-row';
    const title = document.createElement('strong');
    title.textContent = operation.event_type || 'Seguimiento';
    const detail = document.createElement('div');
    detail.className = 'archive-meta';
    const date = operation.created_at ? new Date(operation.created_at).toLocaleString('en-US') : 'Sin fecha';
    const operator = operatorNames.get(operation.created_by) || `Usuario ${String(operation.created_by || '').slice(0, 8)}`;
    detail.textContent = `${date} | ${operator} | ${operation.status || 'Registrado'}${operation.follow_up_at ? ` | Proxima accion: ${formatDateDisplay(operation.follow_up_at)}` : ''}${operation.note ? ` | ${operation.note}` : ''}`;
    row.append(title, detail);
    controls.operationHistory.append(row);
  });
}

function statusLabel(status) {
  const labels = {
    draft: 'Borrador', ready: 'Lista', sent: 'Enviada', viewed: 'Vista',
    signed_digital: 'Firmada digital', signed_physical: 'Firmada fisica',
    declined: 'Rechazada', void: 'Anulada'
  };
  return labels[status] || status;
}

function saleTypeLabel(formData = {}) {
  if (formData.sale_type === 'REPO') return 'REPOSICION';
  if (formData.sale_type === 'VOLUNTARY') return 'ENTREGA VOLUNTARIA';
  if (formData.sale_type === 'BANCO') return 'BANCO';
  return 'BHPH';
}

function formatDateDisplay(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US');
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

async function openArchivedDocument(path) {
  const { data, error } = await supabase.storage
    .from('easycar-documents')
    .createSignedUrl(path, 60 * 10, { download: false });
  if (error) throw error;
  window.open(data.signedUrl, '_blank', 'noopener');
}

function renderArchiveResults(sales) {
  controls.archiveResults.replaceChildren();
  if (!sales.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-history';
    empty.textContent = 'No encontramos expedientes con esa busqueda.';
    controls.archiveResults.append(empty);
    return;
  }

  sales.forEach(sale => {
    const row = document.createElement('div');
    row.className = 'archive-row';

    const customer = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = sale.customer_name || 'Cliente sin nombre';
    const details = document.createElement('div');
    details.className = 'archive-meta';
    details.textContent = [
      sale.customer_email,
      sale.customer_phone,
      sale.contract_number ? `Contrato ${sale.contract_number}` : ''
    ].filter(Boolean).join(' | ');
    customer.append(name, details);

    const vehicle = document.createElement('div');
    const vehicleName = document.createElement('strong');
    vehicleName.textContent = sale.vehicle_description || 'Vehiculo sin completar';
    const vehicleMeta = document.createElement('div');
    vehicleMeta.className = 'archive-meta';
    vehicleMeta.textContent = [
      sale.vin ? `VIN ${sale.vin}` : '',
      sale.stock_number ? `Stock ${sale.stock_number}` : ''
    ].filter(Boolean).join(' | ');
    vehicle.append(vehicleName, vehicleMeta);

    const status = document.createElement('div');
    status.className = 'archive-meta';
    status.textContent = `${saleTypeLabel(sale.form_data)} | ${statusLabel(sale.status)}${sale.transaction_date ? ` | ${formatDateDisplay(sale.transaction_date)}` : ''}`;

    const docs = document.createElement('div');
    docs.className = 'archive-docs';
    const documents = sale.doc_sale_documents || [];
    if (!documents.length) {
      const pending = document.createElement('span');
      pending.className = 'archive-meta';
      pending.textContent = sale.status === 'signed_digital'
        ? 'Firmado, pendiente de archivo PDF'
        : 'Aun no hay PDF firmado archivado';
      docs.append(pending);
    } else {
      documents.forEach((document, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'secondary';
        button.textContent = document.original_name || `Documento firmado ${index + 1}`;
        button.addEventListener('click', () => openArchivedDocument(document.storage_path).catch(error => setCloudStatus(error.message, 'error')));
        docs.append(button);
      });
    }

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'secondary';
    open.textContent = 'Abrir expediente';
    open.addEventListener('click', () => loadSale(sale.id).catch(error => setCloudStatus(error.message, 'error')));
    docs.prepend(open);
    row.append(customer, vehicle, status, docs);
    controls.archiveResults.append(row);
  });
}

async function loadArchive() {
  if (!supabase || !session?.user) return;
  const term = controls.archiveSearch.value.trim();
  const pageSize = 500;
  const sales = [];
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase
      .from('doc_sales')
      .select('id, customer_name, customer_email, customer_phone, vehicle_description, vin, stock_number, contract_number, transaction_date, status, form_data, created_at, doc_sale_documents(id, document_type, storage_path, original_name, created_at)')
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (term) {
      const safeTerm = term.replace(/[%_,]/g, ' ');
      const pattern = `%${safeTerm}%`;
      query = query.or(`customer_name.ilike.${pattern},customer_email.ilike.${pattern},customer_phone.ilike.${pattern},vin.ilike.${pattern},stock_number.ilike.${pattern},contract_number.ilike.${pattern}`);
    }
    const { data, error } = await query;
    if (error) {
      setCloudStatus(`No se pudo buscar en el archivo central: ${error.message}`, 'error');
      return;
    }
    sales.push(...(data || []));
    if ((data || []).length < pageSize) break;
  }
  renderArchiveResults(sales);
  setCloudStatus(`${sales.length} expediente(s) visibles en el archivo central.`, 'good');
}

async function checkDuplicateVin(vin) {
  if (!supabase || !session?.user) return { ready: false, duplicate: false, matches: [] };
  const clean = cleanVin(vin);
  if (clean.length !== 17) return { ready: true, duplicate: false, matches: [] };
  const { data, error } = await supabase
    .from('doc_sales')
    .select('id, customer_name, vehicle_description, stock_number, contract_number, transaction_date, status')
    .eq('vin', clean)
    .order('created_at', { ascending: false })
    .limit(6);
  if (error) throw error;
  const matches = (data || []).filter(sale => sale.id !== currentSaleId);
  return { ready: true, duplicate: matches.length > 0, matches };
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename, rows) {
  const csv = rows.map(row => row.map(csvCell).join(',')).join('\n');
  const blob = new Blob([`\ufeff${csv}\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function exportCustomersCsv() {
  if (!supabase || !session?.user) return;
  controls.exportCustomers.disabled = true;
  setCloudStatus('Preparando descarga de clientes...', '');
  try {
    const { data, error } = await supabase
      .from('doc_sales')
      .select('customer_name, customer_email, customer_phone, vehicle_description, vin, stock_number, contract_number, transaction_date, status, form_data, created_at')
      .order('created_at', { ascending: false })
      .limit(5000);
    if (error) throw error;
    const headers = [
      'cliente', 'email', 'telefono', 'direccion', 'ciudad', 'estado', 'zip',
      'vehiculo', 'ano', 'marca', 'modelo', 'vin', 'millas', 'color', 'placa',
      'stock', 'contrato', 'fecha_venta', 'estatus',
      'seguro_proveedor', 'poliza', 'vence_poliza', 'estado_seguro',
      'gps_imei', 'gps_proveedor', 'estado_gps', 'ultima_ubicacion_gps',
      'gap', 'gap_contrato', 'gap_vin_emitido', 'gap_estatus_reclamo',
      'evento', 'ubicacion_evento', 'poliza_activa_evento', 'ultima_llamada_reclamo',
      'pendiente_reclamo', 'fecha_carga_doc', 'fecha_carga'
    ];
    const rows = [headers, ...(data || []).map(sale => {
      const form = sale.form_data || {};
      return [
        sale.customer_name || [form.first_name, form.middle_name, form.last_name, form.second_last_name].filter(Boolean).join(' '),
        sale.customer_email || form.customer_email,
        sale.customer_phone || form.phone,
        form.address,
        form.city,
        form.state,
        form.zip_code,
        sale.vehicle_description || [form.vehicle_year, form.vehicle_make, form.vehicle_model].filter(Boolean).join(' '),
        form.vehicle_year,
        form.vehicle_make,
        form.vehicle_model,
        sale.vin || form.vin,
        form.vehicle_mileage,
        form.vehicle_color,
        form.vehicle_plate,
        sale.stock_number || form.stock_number,
        sale.contract_number || form.contract_number,
        sale.transaction_date || form.transaction_date,
        statusLabel(sale.status),
        form.insurance_provider,
        form.insurance_policy_number,
        form.insurance_expiration_date,
        form.insurance_status,
        form.gps_imei,
        form.gps_provider,
        form.gps_device_status,
        form.gps_last_location,
        form.gap_has_coverage,
        form.gap_contract_number,
        form.gap_issued_vin,
        form.gap_claim_status,
        form.recovery_event_type,
        form.recovery_last_location,
        form.recovery_policy_active_on_event,
        form.insurance_claim_last_call_date,
        form.gap_last_call_date,
        form.claim_pending_action,
        form.record_loaded_date,
        sale.created_at
      ];
    })];
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`DOC_EASYCAR_clientes_${stamp}.csv`, rows);
    setCloudStatus(`Descarga lista: ${(data || []).length} clientes/exportaciones accesibles para este usuario.`, 'good');
  } catch (error) {
    setCloudStatus(`No se pudo descargar clientes: ${error.message || 'revisa Supabase'}`, 'error');
  } finally {
    controls.exportCustomers.disabled = false;
  }
}

function daysBetween(dateValue, fallback = null) {
  const source = dateValue || fallback;
  if (!source) return null;
  const date = new Date(String(source).includes('T') ? source : `${source}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.floor((today - date) / 86400000);
}

function isPastDue(dateValue) {
  const days = daysBetween(dateValue);
  return days !== null && days > 0;
}

function isDueTodayOrEarlier(dateValue) {
  if (!dateValue) return false;
  const date = new Date(`${String(dateValue).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date <= today;
}

function daysText(days) {
  if (days === null || days === undefined) return 'sin fecha';
  if (days < 0) return `en ${Math.abs(days)} dias`;
  if (days === 0) return 'hoy';
  return `${days} dias`;
}

function cleanVin(value) {
  return String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

function latestOperation(operations = []) {
  return [...operations].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0] || null;
}

function latestOperatorOperation(operations = []) {
  return latestOperation(operations.filter(operation => !String(operation.event_type || '').startsWith('proxima_revision_')));
}

function buildOpsProfile(sale, operations = []) {
  const form = sale.form_data || {};
  const latest = latestOperatorOperation(operations);
  const lastInsuranceReviewSource = form.insurance_verified_date || form.insurance_first_review_date || form.vehicle_loaded_date || sale.transaction_date || sale.created_at;
  const lastGpsReviewSource = form.gps_last_seen_at || form.gps_first_review_date || form.vehicle_loaded_date || sale.transaction_date || sale.created_at;
  const insuranceDaysSince = daysBetween(lastInsuranceReviewSource);
  const gpsDaysSince = daysBetween(lastGpsReviewSource);
  const insuranceOverdue = insuranceDaysSince === null || insuranceDaysSince > 14 || isPastDue(form.insurance_next_review_date);
  const gpsOverdue = gpsDaysSince === null || gpsDaysSince > 10 || isPastDue(form.gps_next_review_date);
  const insuranceCancelled = form.insurance_status === 'Cancelada';
  const insuranceInvalidated = form.insurance_status === 'Anulada';
  const insuranceExpired = form.insurance_status === 'Vencida' || isPastDue(form.insurance_expiration_date);
  const insuranceRepossession = form.insurance_status === 'Reposicion';
  const insuranceCancelledDays = (insuranceCancelled || insuranceInvalidated) ? daysBetween(form.insurance_cancelled_since) : null;
  const policyProblem = !form.insurance_policy_number
    || ['Pendiente', 'Cancelada', 'Anulada', 'Vencida', 'Reposicion', 'No verificable'].includes(form.insurance_status)
    || form.insurance_comprehensive === 'No'
    || form.insurance_collision === 'No'
    || form.insurance_lienholder === 'No'
    || form.insurance_payments_current === 'No'
    || isPastDue(form.insurance_expiration_date)
    || insuranceOverdue;
  const gpsMissing = !form.gps_imei || form.gps_device_status === 'No instalado';
  const gpsExpired = form.gps_device_status === 'Expirado' || isPastDue(form.gps_service_expiration_date);
  const gpsOutsideFlorida = form.gps_location_jurisdiction === 'Fuera de Florida';
  const gpsLocationUnconfirmed = Boolean(form.gps_last_location) && !form.gps_location_jurisdiction
    || form.gps_location_jurisdiction === 'Por confirmar';
  const gpsMileageExceeded = form.gps_monthly_miles_status === 'Sobre 1500 millas'
    || Number(String(form.gps_monthly_miles || '').replace(/[^0-9.]/g, '')) > 1500;
  const gpsProblem = gpsMissing
    || gpsExpired
    || ['No verificado', 'Desconectado', 'Sin senal', 'Removido / alterado', 'No localizado'].includes(form.gps_device_status)
    || form.gps_battery_connected === 'No'
    || gpsMileageExceeded
    || gpsOutsideFlorida
    || gpsLocationUnconfirmed
    || gpsOverdue;
  const gapOpen = Boolean(form.gap_claim_status && !['Sin siniestro', 'Cerrado'].includes(form.gap_claim_status));
  const claimOpenedSource = form.gap_opened_date || form.recovery_event_date || null;
  const gapClaimDays = gapOpen ? daysBetween(claimOpenedSource) : null;
  const insuranceClaimOpen = Boolean(form.insurance_claim_number || ['Seguro abierto', 'Esperando pago seguro'].includes(form.gap_claim_status));
  const insuranceClaimDays = insuranceClaimOpen ? daysBetween(form.insurance_claim_last_call_date || form.recovery_event_date || form.gap_opened_date) : null;
  const soldVin = cleanVin(sale.vin || form.vin);
  const issuedGapVin = cleanVin(form.gap_issued_vin);
  const gapVinMismatch = Boolean(issuedGapVin && soldVin && issuedGapVin !== soldVin);
  const gapProblem = !form.gap_has_coverage
    || form.gap_has_coverage === 'No confirmado'
    || (form.gap_has_coverage === 'Si' && (!form.gap_provider || !form.gap_contract_number || !form.gap_issued_vin))
    || gapVinMismatch
    || form.gap_vin_match === 'No'
    || form.gap_vin_match === 'No confirmado'
    || ['Cancelado', 'No emitido', 'No verificable'].includes(form.gap_contract_status);
  const recoveryOpen = Boolean(form.recovery_event_type && form.recovery_event_type !== 'Ninguno') || insuranceRepossession;
  const siniestroOpen = form.recovery_event_type === 'Siniestro' || insuranceClaimOpen;
  const gapClaimOpen = ['GAP abierto', 'Esperando pago GAP'].includes(form.gap_claim_status);
  const daysSinceOps = daysBetween(latest?.created_at);
  const noteProblem = !latest || !String(latest.note || '').trim() || String(latest.note || '').trim().length < 12;
  const noFollowUp = !latest || (daysSinceOps !== null && daysSinceOps > 14);
  const overdue = insuranceOverdue || gpsOverdue || (gapClaimDays !== null && gapClaimDays > 7) || (insuranceClaimDays !== null && insuranceClaimDays > 7);
  const dueToday = isDueTodayOrEarlier(form.insurance_next_review_date)
    || isDueTodayOrEarlier(form.gps_next_review_date)
    || (gapOpen && (gapClaimDays === null || gapClaimDays >= 7))
    || (insuranceClaimOpen && (insuranceClaimDays === null || insuranceClaimDays >= 7));
  const alerts = [];
  if (policyProblem) alerts.push(insuranceOverdue ? `Seguro sin revisar ${daysText(insuranceDaysSince)}` : 'Seguro requiere accion');
  if (insuranceCancelled || insuranceInvalidated) alerts.push(`Poliza ${String(form.insurance_status).toLowerCase()} ${daysText(insuranceCancelledDays)}`);
  if (gpsMissing) alerts.push('Vehiculo sin GPS');
  if (gpsExpired) alerts.push('GPS expirado');
  if (gpsOutsideFlorida) alerts.push('Vehiculo fuera de Florida');
  if (gpsLocationUnconfirmed) alerts.push('Ubicacion GPS por confirmar');
  if (gpsMileageExceeded) alerts.push('Exceso de millas GPS');
  if (gpsProblem && !gpsMissing && !gpsExpired && !gpsOutsideFlorida && !gpsLocationUnconfirmed && !gpsMileageExceeded) {
    alerts.push(gpsOverdue ? `GPS sin revisar ${daysText(gpsDaysSince)}` : 'GPS requiere accion');
  }
  if (gapProblem) alerts.push(gapVinMismatch ? 'VIN GAP no coincide' : 'GAP requiere verificacion');
  if (gapOpen) alerts.push(`GAP / siniestro activo ${daysText(gapClaimDays)}`);
  if (insuranceClaimOpen) alerts.push(`Reclamo seguro ${daysText(insuranceClaimDays)}`);
  if (insuranceClaimOpen && !form.claim_pending_action && !form.gap_missing_documents) alerts.push('Reclamo sin pendiente definido');
  if (recoveryOpen) alerts.push('Repo / entrega registrado');
  if (recoveryOpen && !form.recovery_last_location) alerts.push('Repo/entrega sin ubicacion');
  if (recoveryOpen && !form.recovery_policy_active_on_event) alerts.push('Repo/entrega sin poliza del evento');
  if (noFollowUp) alerts.push(`Sin seguimiento operador ${daysText(daysSinceOps)}`);
  if (noteProblem) alerts.push('Falta nota auditable');
  return {
    sale, form, operations, latest, policyProblem, gpsProblem, gpsMissing, gpsExpired,
    gpsOutsideFlorida, gpsLocationUnconfirmed, gpsMileageExceeded, gapProblem, gapOpen,
    insuranceClaimOpen, insuranceCancelled, insuranceInvalidated, insuranceExpired, insuranceRepossession,
    insuranceCancelledDays, siniestroOpen, gapClaimOpen, recoveryOpen, noFollowUp, noteProblem, overdue, alerts,
    insuranceDaysSince, gpsDaysSince, gapClaimDays, insuranceClaimDays, daysSinceOps, dueToday
  };
}

function opsVisible(profile) {
  const term = controls.opsSearch?.value.trim().toLowerCase() || '';
  if (term) {
    const haystack = [
      profile.sale.customer_name,
      profile.sale.customer_email,
      profile.sale.customer_phone,
      profile.sale.vehicle_description,
      profile.sale.vin,
      profile.sale.stock_number,
      profile.sale.contract_number,
      profile.form.gps_imei,
      profile.form.gap_contract_number,
      profile.form.insurance_policy_number,
      profile.form.gps_last_location
    ].filter(Boolean).join(' ').toLowerCase();
    if (!haystack.includes(term)) return false;
  }
  if (opsFilter === 'insurance') return profile.policyProblem;
  if (opsFilter === 'gps') return profile.gpsProblem;
  if (opsFilter === 'outside_florida') return profile.gpsOutsideFlorida;
  if (opsFilter === 'gps_missing') return profile.gpsMissing;
  if (opsFilter === 'gps_expired') return profile.gpsExpired;
  if (opsFilter === 'mileage') return profile.gpsMileageExceeded;
  if (opsFilter === 'claims') return profile.siniestroOpen;
  if (opsFilter === 'gap_claim') return profile.gapClaimOpen;
  if (opsFilter === 'recovery') return profile.recoveryOpen;
  if (opsFilter === 'overdue') return profile.overdue;
  if (opsFilter === 'operator') return profile.noFollowUp || profile.noteProblem;
  if (opsFilter === 'agenda') return profile.dueToday;
  return true;
}

function renderOpsMetric(label, value, filter = '', detail = '') {
  const box = document.createElement(filter ? 'button' : 'div');
  if (filter) box.type = 'button';
  box.className = 'ops-metric';
  if (filter) {
    box.dataset.opsFilter = filter;
    box.classList.toggle('active', opsFilter === filter);
  }
  const number = document.createElement('strong');
  number.textContent = value;
  const text = document.createElement('span');
  text.textContent = label;
  box.append(number, text);
  if (detail) {
    const detailText = document.createElement('em');
    detailText.textContent = detail;
    box.append(detailText);
  }
  return box;
}

function isOperatorAction(operation) {
  return operation && !String(operation.event_type || '').startsWith('proxima_revision_');
}

function startOfLocalDay(daysAgo = 0) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date;
}

function renderOperatorSummary(operations) {
  if (!controls.opsOperatorSummary) return;
  controls.opsOperatorSummary.replaceChildren();
  const operatorActions = operations.filter(isOperatorAction);
  if (!operatorActions.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-history';
    empty.textContent = 'Aun no hay acciones reales registradas por operadores.';
    controls.opsOperatorSummary.append(empty);
    return;
  }
  const today = startOfLocalDay();
  const sevenDays = startOfLocalDay(6);
  const byOperator = new Map();
  operatorActions.forEach(operation => {
    const key = operation.created_by || 'sin_usuario';
    const name = operation.operator_name || `Usuario ${String(key).slice(0, 8)}`;
    if (!byOperator.has(key)) {
      byOperator.set(key, { name, total: 0, today: 0, week: 0, missingNotes: 0, latest: null });
    }
    const summary = byOperator.get(key);
    const createdAt = new Date(operation.created_at || 0);
    summary.total += 1;
    if (createdAt >= today) summary.today += 1;
    if (createdAt >= sevenDays) summary.week += 1;
    if (String(operation.note || '').trim().length < 12) summary.missingNotes += 1;
    if (!summary.latest || createdAt > new Date(summary.latest.created_at || 0)) summary.latest = operation;
  });
  [...byOperator.values()]
    .sort((a, b) => b.week - a.week || b.total - a.total || a.name.localeCompare(b.name))
    .forEach(summary => {
      const row = document.createElement('div');
      row.className = 'ops-operator-row';
      const name = document.createElement('strong');
      name.textContent = summary.name;
      const todayText = document.createElement('span');
      todayText.textContent = `Hoy: ${summary.today}`;
      const weekText = document.createElement('span');
      weekText.textContent = `7 dias: ${summary.week}`;
      const totalText = document.createElement('span');
      totalText.textContent = `Total: ${summary.total}`;
      const latestText = document.createElement('span');
      const latestDate = summary.latest?.created_at ? new Date(summary.latest.created_at).toLocaleString('en-US') : 'sin fecha';
      latestText.textContent = `${summary.missingNotes ? `Sin nota: ${summary.missingNotes} | ` : ''}Ultima: ${latestDate}`;
      row.append(name, todayText, weekText, totalText, latestText);
      controls.opsOperatorSummary.append(row);
    });
}

function messageTemplate(profile) {
  const name = profile.sale.customer_name || 'cliente';
  if (profile.policyProblem) {
    return `Hola ${name}, EasyCar LLC necesita actualizar/verificar su poliza del vehiculo ${profile.sale.vehicle_description || ''}. Debe estar activa, con comprehensive, collision, pagos al dia y EasyCar LLC como lien holder. Por favor envie la poliza vigente hoy.`;
  }
  if (profile.gpsProblem) {
    return `Hola ${name}, EasyCar LLC necesita verificar el GPS del vehiculo ${profile.sale.vehicle_description || ''}. Por favor confirme la ubicacion actual del vehiculo y disponibilidad para revision del dispositivo.`;
  }
  if (profile.gapOpen) {
    return `Hola ${name}, EasyCar LLC esta dando seguimiento al reclamo/siniestro del vehiculo ${profile.sale.vehicle_description || ''}. Por favor envie cualquier documento pendiente del seguro o GAP para continuar el proceso.`;
  }
  return `Hola ${name}, EasyCar LLC esta actualizando el expediente del vehiculo ${profile.sale.vehicle_description || ''}. Por favor comuniquese con nosotros para confirmar la informacion pendiente.`;
}

async function copyCustomerMessage(profile) {
  const text = messageTemplate(profile);
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    setCloudStatus('Mensaje preparado y copiado. Puedes enviarlo por WhatsApp, SMS o email.', 'good');
  } else {
    window.prompt('Mensaje para el cliente', text);
  }
}

function openOpsSale(profile) {
  loadSale(profile.sale.id)
    .then(() => {
      app.setActiveModule?.('INSURANCE_GPS');
      setCloudStatus('Expediente abierto en GPS Y SEGURO. Registra la revision para dejar fecha, hora y usuario.', 'good');
    })
    .catch(error => setCloudStatus(error.message, 'error'));
}

function showOpsHistory(profile) {
  const header = `${profile.sale.customer_name || 'Cliente sin nombre'}\n${profile.sale.vehicle_description || 'Vehiculo'}${profile.sale.vin ? ` | VIN ${profile.sale.vin}` : ''}`;
  const current = [
    `Seguro: ${profile.form.insurance_status || 'sin verificar'} | Poliza: ${profile.form.insurance_policy_number || 'sin numero'} | Vence: ${profile.form.insurance_expiration_date || 'sin fecha'} | Cancelada/anulada desde: ${profile.form.insurance_cancelled_since || 'no aplica'} | Sin revisar: ${daysText(profile.insuranceDaysSince)}`,
    `GPS: ${profile.form.gps_device_status || 'sin verificar'} | IMEI: ${profile.form.gps_imei || 'sin IMEI'} | Ubicacion: ${profile.form.gps_last_location || 'sin ubicacion'} (${profile.form.gps_location_jurisdiction || 'por confirmar'}) | Vence servicio: ${profile.form.gps_service_expiration_date || 'sin fecha'} | Millas periodo: ${profile.form.gps_monthly_miles || 'sin dato'} | Sin revisar: ${daysText(profile.gpsDaysSince)}`,
    `GAP: ${profile.form.gap_has_coverage || 'sin verificar'} | Contrato: ${profile.form.gap_contract_number || 'sin contrato'} | VIN GAP: ${profile.form.gap_issued_vin || 'sin VIN'} | Reclamo abierto: ${daysText(profile.gapClaimDays)}`,
    `Evento: ${profile.form.recovery_event_type || 'ninguno'} | Fecha: ${profile.form.recovery_event_date || 'sin fecha'} | Poliza activa ese dia: ${profile.form.recovery_policy_active_on_event || 'sin confirmar'}`
  ].join('\n');
  const history = profile.operations.length
    ? profile.operations.slice(0, 12).map(operation => {
      const date = operation.created_at ? new Date(operation.created_at).toLocaleString('en-US') : 'sin fecha';
      const nextAction = operation.payload?.ops_next_action ? ` | Proxima accion: ${operation.payload.ops_next_action}` : '';
      const operator = (operation.operator_name || operation.created_by)
        ? ` | Operador: ${operation.operator_name || String(operation.created_by).slice(0, 8)}`
        : '';
      return `- ${date}: ${operation.event_type} | ${operation.status}${operator}${nextAction}${operation.note ? ` | Nota: ${operation.note}` : ' | Sin nota'}`;
    }).join('\n')
    : '- Sin historial operativo registrado todavia.';
  window.alert(`${header}\n\nESTADO ACTUAL\n${current}\n\nHISTORIAL DEL OPERADOR\n${history}`);
}

function renderOpsReport(profiles) {
  const operations = profiles.flatMap(profile => profile.operations || []);
  const operatorActions = operations.filter(isOperatorAction);
  const today = startOfLocalDay();
  const sevenDays = startOfLocalDay(6);
  controls.opsSummary.replaceChildren(
    renderOpsMetric('Clientes', profiles.length, 'all', 'Abrir todos los expedientes'),
    renderOpsMetric('Agenda de hoy', profiles.filter(profile => profile.dueToday).length, 'agenda', 'Verificaciones y llamadas que vencen hoy'),
    renderOpsMetric('Alertas de seguro', profiles.filter(profile => profile.policyProblem).length, 'insurance', `${profiles.filter(profile => profile.insuranceExpired).length} vencidas · ${profiles.filter(profile => profile.insuranceCancelled).length} canceladas · ${profiles.filter(profile => profile.insuranceInvalidated).length} anuladas`),
    renderOpsMetric('Siniestros', profiles.filter(profile => profile.siniestroOpen).length, 'claims', 'Reclamos abiertos con el seguro'),
    renderOpsMetric('GAP en reclamo', profiles.filter(profile => profile.gapClaimOpen).length, 'gap_claim', 'Casos abiertos o esperando pago GAP'),
    renderOpsMetric('Alertas GPS', profiles.filter(profile => profile.gpsProblem).length, 'gps', `${profiles.filter(profile => profile.gpsMissing).length} sin GPS · ${profiles.filter(profile => profile.gpsExpired).length} expirados · ${profiles.filter(profile => profile.gpsMileageExceeded).length} exceso millas`),
    renderOpsMetric('Auditoria operador', profiles.filter(profile => profile.noFollowUp || profile.noteProblem).length, 'operator', 'Sin nota o sin seguimiento oportuno'),
    renderOpsMetric('Acciones hoy', operatorActions.filter(operation => new Date(operation.created_at || 0) >= today).length),
    renderOpsMetric('Acciones 7 dias', operatorActions.filter(operation => new Date(operation.created_at || 0) >= sevenDays).length),
    renderOpsMetric('Operadores activos', new Set(operatorActions.map(operation => operation.created_by).filter(Boolean)).size)
  );
  renderOperatorSummary(operations);

  controls.opsResults.replaceChildren();
  const visibleProfiles = profiles.filter(opsVisible).sort((a, b) => {
    const score = profile => (profile.overdue ? 40 : 0)
      + (profile.policyProblem ? 15 : 0)
      + (profile.gpsProblem ? 15 : 0)
      + (profile.gpsOutsideFlorida ? 20 : 0)
      + (profile.gpsExpired ? 15 : 0)
      + (profile.gpsMileageExceeded ? 10 : 0)
      + (profile.gapOpen ? 10 : 0)
      + (profile.noFollowUp ? 8 : 0)
      + (profile.noteProblem ? 5 : 0);
    return score(b) - score(a);
  });
  if (!visibleProfiles.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-history';
    empty.textContent = 'No hay casos para este filtro.';
    controls.opsResults.append(empty);
    return;
  }

  visibleProfiles.forEach(profile => {
    const row = document.createElement('div');
    row.className = 'ops-row';

    const identity = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = profile.sale.customer_name || 'Cliente sin nombre';
    const identityMeta = document.createElement('div');
    identityMeta.className = 'archive-meta';
    identityMeta.textContent = [
      profile.sale.customer_phone,
      profile.sale.customer_email,
      profile.sale.contract_number ? `Contrato ${profile.sale.contract_number}` : ''
    ].filter(Boolean).join(' | ');
    identity.append(name, identityMeta);

    const vehicle = document.createElement('div');
    const vehicleName = document.createElement('strong');
    vehicleName.textContent = profile.sale.vehicle_description || 'Vehiculo sin completar';
    const vehicleMeta = document.createElement('div');
    vehicleMeta.className = 'archive-meta';
    vehicleMeta.textContent = [
      profile.sale.vin ? `VIN ${profile.sale.vin}` : '',
      profile.sale.stock_number ? `Stock ${profile.sale.stock_number}` : '',
      profile.form.gps_last_location ? `Ubicacion ${profile.form.gps_last_location}` : '',
      profile.form.gps_location_jurisdiction ? profile.form.gps_location_jurisdiction : ''
    ].filter(Boolean).join(' | ');
    vehicle.append(vehicleName, vehicleMeta);

    const status = document.createElement('div');
    const headline = document.createElement('div');
    headline.className = profile.alerts.length ? 'ops-alert' : 'ops-ok';
    headline.textContent = profile.alerts.length ? profile.alerts.join(' | ') : 'Al dia';
    const detail = document.createElement('div');
    detail.className = 'archive-meta';
    detail.textContent = [
      `Seguro: ${daysText(profile.insuranceDaysSince)} desde revision / prox. ${profile.form.insurance_next_review_date ? formatDateDisplay(profile.form.insurance_next_review_date) : 'sin fecha'}`,
      profile.insuranceCancelled || profile.insuranceInvalidated ? `Poliza ${String(profile.form.insurance_status).toLowerCase()} desde ${profile.form.insurance_cancelled_since ? formatDateDisplay(profile.form.insurance_cancelled_since) : 'sin fecha'} (${daysText(profile.insuranceCancelledDays)})` : '',
      profile.insuranceRepossession ? `Reposicion: poliza en evento ${profile.form.recovery_policy_active_on_event || 'sin confirmar'} | ubicacion ${profile.form.recovery_last_location || 'sin confirmar'}` : '',
      `GPS: ${daysText(profile.gpsDaysSince)} desde revision / prox. ${profile.form.gps_next_review_date ? formatDateDisplay(profile.form.gps_next_review_date) : 'sin fecha'}`,
      profile.gpsOutsideFlorida ? 'Alerta: fuera de Florida' : '',
      profile.gpsMissing ? 'Alerta: sin GPS instalado' : '',
      profile.gpsExpired ? `Alerta: GPS expirado${profile.form.gps_service_expiration_date ? ` (${formatDateDisplay(profile.form.gps_service_expiration_date)})` : ''}` : '',
      profile.gpsMileageExceeded ? `Alerta: ${profile.form.gps_monthly_miles || 'mas de 1,500'} millas en el periodo` : '',
      profile.form.gap_has_coverage ? `GAP ${profile.form.gap_has_coverage}${profile.form.gap_issued_vin ? ` / VIN ${profile.form.gap_issued_vin}` : ''}` : 'GAP sin verificar',
      profile.gapOpen ? `GAP abierto ${daysText(profile.gapClaimDays)}` : '',
      profile.insuranceClaimOpen ? `Reclamo seguro ${daysText(profile.insuranceClaimDays)}` : '',
      profile.latest ? `Ultimo trabajo ${daysText(profile.daysSinceOps)}: ${profile.latest.event_type} / ${profile.latest.status}${profile.latest.operator_name ? ` por ${profile.latest.operator_name}` : ''}` : 'Sin historial operativo',
      profile.latest?.note ? `Nota: ${profile.latest.note.slice(0, 90)}` : 'Sin nota auditable'
    ].filter(Boolean).join(' | ');
    status.append(headline, detail);

    const actions = document.createElement('div');
    actions.className = 'archive-docs';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'secondary';
    open.textContent = 'Abrir';
    open.addEventListener('click', () => openOpsSale(profile));
    const message = document.createElement('button');
    message.type = 'button';
    message.className = 'secondary';
    message.textContent = 'Mensaje';
    message.addEventListener('click', () => copyCustomerMessage(profile).catch(error => setCloudStatus(error.message, 'error')));
    const history = document.createElement('button');
    history.type = 'button';
    history.className = 'secondary';
    history.textContent = 'Historial';
    history.addEventListener('click', () => showOpsHistory(profile));
    actions.append(open, history, message);

    row.append(identity, vehicle, status, actions);
    controls.opsResults.append(row);
  });
}

async function loadOpsReport() {
  if (!supabase || !session?.user || !controls.opsReport) return;
  const pageSize = 500;
  const sales = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('doc_sales')
      .select('id, customer_name, customer_email, customer_phone, vehicle_description, vin, stock_number, contract_number, transaction_date, status, form_data, created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) {
      setCloudStatus(`No se pudo cargar Control GPS / Seguro: ${error.message}`, 'error');
      return;
    }
    sales.push(...(data || []));
    if ((data || []).length < pageSize) break;
  }

  const operations = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('doc_sale_operations')
      .select('id, sale_id, module, event_type, status, follow_up_at, note, payload, created_by, created_at')
      .eq('module', 'insurance_gps')
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) {
      if (error.code === '42P01' || /doc_sale_operations|relation/i.test(error.message || '')) {
        setCloudStatus('Control GPS / Seguro visible. Falta activar la tabla de auditoria en Supabase para guardar historial del operador.', 'error');
        renderOpsReport(sales.map(sale => buildOpsProfile(sale, [])));
        return;
      }
      setCloudStatus(`No se pudo cargar historial GPS / Seguro: ${error.message}`, 'error');
      return;
    }
    operations.push(...(data || []));
    if ((data || []).length < pageSize) break;
  }

  const operatorIds = [...new Set(operations.map(operation => operation.created_by).filter(Boolean))];
  const operatorNames = new Map();
  for (let index = 0; index < operatorIds.length; index += pageSize) {
    const ids = operatorIds.slice(index, index + pageSize);
    const { data, error } = await supabase
      .from('doc_user_profiles')
      .select('id, full_name')
      .in('id', ids);
    if (!error) (data || []).forEach(profile => operatorNames.set(profile.id, profile.full_name || 'Usuario sin nombre'));
  }
  operations.forEach(operation => {
    operation.operator_name = operatorNames.get(operation.created_by) || `Usuario ${String(operation.created_by || '').slice(0, 8)}`;
  });
  const bySale = new Map();
  operations.forEach(operation => {
    if (!bySale.has(operation.sale_id)) bySale.set(operation.sale_id, []);
    bySale.get(operation.sale_id).push(operation);
  });
  renderOpsReport(sales.map(sale => buildOpsProfile(sale, bySale.get(sale.id) || [])));
}

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` };
}

function renderAdminUsers(users) {
  controls.adminUsers.replaceChildren();
  users.forEach(user => {
    const row = document.createElement('div');
    row.className = 'admin-user-row';
    const who = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = user.full_name || user.email;
    const email = document.createElement('div');
    email.textContent = user.email;
    who.append(name, email);
    const role = document.createElement('div');
    role.textContent = user.role === 'admin' ? 'Admin' : user.role === 'manager' ? 'Manager' : 'Vendedor';
    const active = document.createElement('div');
    active.textContent = user.active ? 'Activo' : 'Inactivo';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'secondary';
    edit.textContent = 'Editar';
    edit.addEventListener('click', () => editAdminUser(user));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'secondary';
    remove.textContent = user.active ? 'Desactivar' : 'Eliminar';
    remove.addEventListener('click', () => deleteAdminUser(user));
    row.append(who, role, active, edit, remove);
    controls.adminUsers.append(row);
  });
}

async function loadAdminUsers() {
  if (!session?.access_token) return;
  const response = await fetch('/api/admin/users', { headers: authHeaders() });
  if (response.status === 403) {
    controls.adminPanel.hidden = true;
    return;
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'No se pudo cargar usuarios');
  controls.adminPanel.hidden = false;
  renderAdminUsers(result.users || []);
}

async function saveAdminUser(mode) {
  const email = controls.adminUserEmail.value.trim();
  const fullName = controls.adminUserName.value.trim();
  const role = controls.adminUserRole.value;
  const password = controls.adminUserPassword.value;
  if (!email) return setCloudStatus('Escribe el email del usuario.', 'error');
  if (mode !== 'invite' && password.length < 8) return setCloudStatus('La contrasena debe tener al menos 8 caracteres.', 'error');
  const response = await fetch('/api/admin/users', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ action: 'create', mode, email, full_name: fullName, role, password, active: true })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'No se pudo crear el usuario');
  controls.adminUserEmail.value = '';
  controls.adminUserName.value = '';
  controls.adminUserPassword.value = '';
  renderAdminUsers(result.users || []);
  setCloudStatus(mode === 'invite' ? 'Invitacion enviada y usuario registrado.' : 'Usuario creado correctamente.', 'good');
}

async function runBulkImport() {
  controls.importRun.disabled = true;
  controls.importStatus.textContent = 'Leyendo archivo y creando expedientes centrales...';
  controls.importStatus.className = 'status';
  try {
    const result = await importSalesFromCsv(controls.importFile.files?.[0]);
    controls.importStatus.textContent = `Carga completada: ${result.inserted} expedientes creados, ${result.skipped} filas omitidas por duplicado o vacias.`;
    controls.importStatus.className = 'status good';
    setCloudStatus('Carga masiva completada. Los clientes ya aparecen en archivo central y GPS Y SEGURO.', 'good');
    controls.importFile.value = '';
  } catch (error) {
    controls.importStatus.textContent = `No se pudo cargar el archivo: ${error.message || 'revisa el CSV'}`;
    controls.importStatus.className = 'status warn';
  } finally {
    controls.importRun.disabled = false;
  }
}

async function editAdminUser(user) {
  const fullName = window.prompt('Nombre del usuario', user.full_name || '') ?? user.full_name;
  const role = window.prompt('Rol: seller, manager o admin', user.role || 'seller') ?? user.role;
  const password = window.prompt('Nueva contrasena opcional. Deja vacio para no cambiarla.', '') || '';
  const response = await fetch('/api/admin/users', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ action: 'update', id: user.id, email: user.email, full_name: fullName, role, password, active: true })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'No se pudo actualizar el usuario');
  renderAdminUsers(result.users || []);
  setCloudStatus('Usuario actualizado.', 'good');
}

async function deleteAdminUser(user) {
  const hardDelete = !user.active;
  const verb = hardDelete ? 'eliminar definitivamente' : 'desactivar';
  if (!window.confirm(`Vas a ${verb} el acceso de ${user.email}. ¿Continuar?`)) return;
  const response = await fetch('/api/admin/users', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ action: 'delete', id: user.id, hardDelete })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'No se pudo modificar el usuario');
  renderAdminUsers(result.users || []);
  setCloudStatus(hardDelete ? 'Usuario eliminado definitivamente.' : 'Usuario desactivado.', 'good');
}

async function sendForSignature() {
  if (!session?.access_token) throw new Error('Debes entrar con un correo autorizado antes de enviar documentos.');
  const formData = withNormalizedPhones(app.collectFormData());
  const missing = validateForSignature(formData);
  if (missing.length) {
    const firstInvalid = document.querySelector('.field-error');
    if (firstInvalid) firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
    throw new Error(`No se puede enviar todavia. Falta: ${missing.join(', ')}`);
  }
  const sale = await saveSale(formData);

  const saleType = formData.sale_type === 'REPO' ? 'REPO' : formData.sale_type === 'VOLUNTARY' ? 'ENTREGA VOLUNTARIA' : formData.sale_type === 'BANCO' ? 'BANCO' : 'BHPH';
  const approved = window.confirm(`Se enviaran los documentos ${saleType} al email ${formData.customer_email}. El codigo obligatorio de firma llegara por SMS al telefono ${formData.phone}. ¿Continuar?`);
  if (!approved) return;

  setCloudStatus('Creando expediente y enviando la solicitud al cliente...', '');
  controls.sendSignature.disabled = true;
  try {
    const response = await fetch('/api/signature/create', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ saleId: sale.id })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se pudo enviar para firma');
    setCurrentSale(result.saleId || sale?.id, 'sent');
    controls.signatureResult.replaceChildren();
    const smsText = result.smsTo ? ` SMS solicitado a ${result.smsTo}.` : '';
    const text = document.createTextNode(`Firma digital enviada al cliente: ${result.sentTo}.${smsText} EasyCar queda como contacto de respuesta. `);
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
    if (session?.user) {
      await loadRecentSales();
      await loadArchive();
      await loadOpsReport();
    }
  } finally {
    controls.sendSignature.disabled = false;
  }
}

async function sendLoginLink() {
  const email = controls.sellerEmail.value.trim();
  const password = controls.sellerPassword.value;
  if (!email) return setCloudStatus('Escribe el correo del vendedor para entrar al sistema.', 'error');
  if (!password) return setCloudStatus('Escribe la contrasena del vendedor para entrar al sistema.', 'error');
  controls.sendLogin.disabled = true;
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;
    controls.sellerPassword.value = '';
    setCloudStatus(`Acceso autorizado: ${email}.`, 'good');
  } catch (error) {
    setCloudStatus('No se pudo entrar. Revisa el correo y la contrasena del vendedor.', 'error');
  } finally {
    controls.sendLogin.disabled = false;
  }
}

function showPasswordRecovery() {
  controls.passwordRecovery.hidden = false;
  controls.passwordRecovery.classList.add('visible');
  controls.recoveryPassword.focus();
  setCloudStatus('Enlace confirmado. Crea y guarda una nueva contrasena para continuar.', 'good');
}

function hidePasswordRecovery() {
  controls.passwordRecovery.classList.remove('visible');
  controls.passwordRecovery.hidden = true;
  controls.recoveryPassword.value = '';
  controls.recoveryPasswordConfirm.value = '';
}

async function requestPasswordReset() {
  const email = controls.sellerEmail.value.trim();
  if (!email) return setCloudStatus('Escribe tu correo para recibir el enlace de recuperacion.', 'error');
  controls.requestPasswordReset.disabled = true;
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/?recovery=password`
    });
    if (error) throw error;
    setCloudStatus('Si el correo esta autorizado, recibira un enlace seguro para crear una nueva contrasena.', 'good');
  } catch (error) {
    setCloudStatus('No se pudo solicitar la recuperacion. Intenta de nuevo o contacta al administrador.', 'error');
  } finally {
    controls.requestPasswordReset.disabled = false;
  }
}

async function saveRecoveredPassword() {
  const password = controls.recoveryPassword.value;
  const confirmation = controls.recoveryPasswordConfirm.value;
  if (password.length < 12) return setCloudStatus('La nueva contrasena debe tener al menos 12 caracteres.', 'error');
  if (password !== confirmation) return setCloudStatus('Las contrasenas no coinciden.', 'error');
  controls.saveRecoveredPassword.disabled = true;
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    hidePasswordRecovery();
    window.history.replaceState({}, document.title, window.location.pathname);
    setCloudStatus('Contrasena actualizada correctamente.', 'good');
  } catch (error) {
    setCloudStatus('No se pudo actualizar la contrasena. Solicita un nuevo enlace de recuperacion.', 'error');
  } finally {
    controls.saveRecoveredPassword.disabled = false;
  }
}

function newSale() {
  setCurrentSale(null);
  app.clearForm();
  controls.signatureResult.classList.remove('visible');
  setCloudStatus('Formulario limpio para una nueva venta. Completa los datos y envia al cliente cuando este listo.', 'good');
}

window.EasyCarCloud = { saveSale, saveInsuranceGpsReview, checkDuplicateVin, scheduleAutoSave };

if (!configured) {
  document.body.dataset.auth = 'signed-in';
  controls.auth.style.display = 'none';
  setCloudStatus('Supabase no esta configurado en Vercel. Puedes llenar e imprimir, pero no guardar ni enviar firma digital.');
} else {
  controls.sendLogin.addEventListener('click', sendLoginLink);
  controls.requestPasswordReset.addEventListener('click', requestPasswordReset);
  controls.saveRecoveredPassword.addEventListener('click', () => saveRecoveredPassword());
  controls.sellerPassword.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      sendLoginLink();
    }
  });
  controls.searchArchive.addEventListener('click', () => loadArchive().catch(error => setCloudStatus(error.message, 'error')));
  controls.exportCustomers.addEventListener('click', () => exportCustomersCsv().catch(error => setCloudStatus(error.message, 'error')));
  controls.adminCreateUser.addEventListener('click', () => saveAdminUser('create').catch(error => setCloudStatus(error.message, 'error')));
  controls.adminInviteUser.addEventListener('click', () => saveAdminUser('invite').catch(error => setCloudStatus(error.message, 'error')));
  controls.importTemplate.addEventListener('click', downloadImportTemplate);
  controls.importRun.addEventListener('click', runBulkImport);
  controls.archiveSearch.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      loadArchive().catch(error => setCloudStatus(error.message, 'error'));
    }
  });
  controls.signOut.addEventListener('click', async () => {
    await supabase.auth.signOut();
    setCurrentSale(null);
  });
  controls.newSale.addEventListener('click', newSale);
  controls.sendSignature.addEventListener('click', () => sendForSignature().catch(error => setCloudStatus(error.message, 'error')));
  const setOpsFilterFromEvent = event => {
    const button = event.target.closest('[data-ops-filter]');
    if (!button) return;
    opsFilter = button.dataset.opsFilter || 'all';
    controls.opsSummary.querySelectorAll('[data-ops-filter]').forEach(item => item.classList.toggle('active', item.dataset.opsFilter === opsFilter));
    loadOpsReport().catch(error => setCloudStatus(error.message, 'error'));
  };
  controls.opsSummary.addEventListener('click', setOpsFilterFromEvent);
  controls.opsSearch.addEventListener('input', () => loadOpsReport().catch(error => setCloudStatus(error.message, 'error')));
  controls.clearOpsSearch.addEventListener('click', () => {
    controls.opsSearch.value = '';
    loadOpsReport().catch(error => setCloudStatus(error.message, 'error'));
  });

  const { data } = await supabase.auth.getSession();
  setSessionUi(data.session);
  supabase.auth.onAuthStateChange((event, nextSession) => {
    setSessionUi(nextSession);
    if (event === 'PASSWORD_RECOVERY') showPasswordRecovery();
  });
}
