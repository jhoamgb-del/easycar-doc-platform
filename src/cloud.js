import { createClient } from '@supabase/supabase-js';

const app = window.EasyCarApp;
const DEFAULT_SELLER_EMAIL = 'sales@easycarus.com';
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
  sendInsuranceSms: byId('sendInsuranceSms'),
  markSignedPhysical: byId('markSignedPhysical'),
  markSignedPhysicalFile: byId('markSignedPhysicalFile'),
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
  importHistory: byId('bulkImportHistory'),
  opsReport: byId('opsReportPanel'),
  opsSummary: byId('opsSummary'),
  opsSubfilters: byId('opsSubfilters'),
  opsCalendarPanel: byId('opsCalendarPanel'),
  opsOperatorPanel: byId('opsOperatorPanel'),
  opsHealthStrip: byId('opsHealthStrip'),
  opsResultsTitle: byId('opsResultsTitle'),
  opsResultsCount: byId('opsResultsCount'),
  opsRefreshReport: byId('opsRefreshReport'),
  opsExportReport: byId('opsExportReport'),
  opsHistoryDialog: byId('opsHistoryDialog'),
  opsHistoryTitle: byId('opsHistoryTitle'),
  opsHistoryMeta: byId('opsHistoryMeta'),
  opsHistoryStatus: byId('opsHistoryStatus'),
  opsHistoryAction: byId('opsHistoryAction'),
  opsHistoryDue: byId('opsHistoryDue'),
  opsHistorySeverity: byId('opsHistorySeverity'),
  opsHistoryClientFacts: byId('opsHistoryClientFacts'),
  opsHistoryVehicleFacts: byId('opsHistoryVehicleFacts'),
  opsHistoryInsuranceFacts: byId('opsHistoryInsuranceFacts'),
  opsHistoryGpsFacts: byId('opsHistoryGpsFacts'),
  opsHistoryPending: byId('opsHistoryPending'),
  opsHistoryInsurance: byId('opsHistoryInsurance'),
  opsHistoryGps: byId('opsHistoryGps'),
  opsHistoryActivityAudit: byId('opsHistoryActivityAudit'),
  opsHistoryOther: byId('opsHistoryOther'),
  opsHistoryEditSale: byId('opsHistoryEditSale'),
  opsHistoryEditControl: byId('opsHistoryEditControl'),
  customerCaseDialog: byId('customerCaseDialog'),
  customerCaseTitle: byId('customerCaseTitle'),
  customerCaseMeta: byId('customerCaseMeta'),
  customerCaseSales: byId('customerCaseSales'),
  opsCalendarTitle: byId('opsCalendarTitle'),
  opsCalendarGrid: byId('opsCalendarGrid'),
  opsCalendarAgenda: byId('opsCalendarAgenda'),
  opsCalendarPrevious: byId('opsCalendarPrevious'),
  opsCalendarNext: byId('opsCalendarNext'),
  connectGoogleCalendar: byId('connectGoogleCalendar'),
  calendarConnectionStatus: byId('calendarConnectionStatus'),
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
let opsProfilesCache = [];
let opsLoadedAt = null;
let autosaveTimer = null;
let autosaveGeneration = 0;
let saleInsertPromise = null;
let saleUpdatePromise = Promise.resolve();
let realtimeChannel = null;
let realtimeRefreshTimer = null;
let currentProfileRole = '';
let opsCalendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let currentHistoryProfile = null;

function setCloudStatus(message, tone = '') {
  controls.status.textContent = message;
  controls.status.style.color = tone === 'error' ? '#9d1d28' : tone === 'good' ? '#087443' : '';
}

function setCurrentSale(id, status = 'draft') {
  const nextSaleId = id || null;
  if (currentSaleId !== nextSaleId) {
    clearTimeout(autosaveTimer);
    autosaveGeneration += 1;
  }
  currentSaleId = nextSaleId;
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
  currentProfileRole = '';
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
    loadImportBatches();
    loadCurrentProfileRole()
      .then(role => {
        loadImportBatches();
        if (role === 'admin') {
          controls.adminPanel.hidden = false;
          return loadAdminUsers();
        }
        return null;
      })
      .catch(error => setCloudStatus(`No se pudo confirmar el rol de acceso: ${error.message}`, 'error'));
    subscribeToCentralUpdates();
  } else {
    opsProfilesCache = [];
    opsLoadedAt = null;
    controls.opsSummary?.replaceChildren();
    controls.opsResults?.replaceChildren();
    unsubscribeFromCentralUpdates();
  }
}

function unsubscribeFromCentralUpdates() {
  if (realtimeChannel && supabase) supabase.removeChannel(realtimeChannel);
  realtimeChannel = null;
  clearTimeout(realtimeRefreshTimer);
}

function refreshCentralViews() {
  clearTimeout(realtimeRefreshTimer);
  realtimeRefreshTimer = window.setTimeout(() => {
    Promise.allSettled([loadRecentSales(), loadArchive(), loadOpsReport()]);
    if (currentSaleId) loadSaleOperationHistory(currentSaleId).catch(() => {});
  }, 350);
}

function subscribeToCentralUpdates() {
  if (!supabase || !session?.user) return;
  unsubscribeFromCentralUpdates();
  realtimeChannel = supabase
    .channel(`easycar-central-${session.user.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'doc_sales' }, refreshCentralViews)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'doc_sale_operations' }, refreshCentralViews)
    .subscribe();
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
    ['customer_birth_date', 'Fecha de nacimiento del cliente'],
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
  if (formData.customer_birth_date && !validBirthDate(formData.customer_birth_date)) {
    missing.push('Fecha de nacimiento valida y no futura');
    invalidIds.add('customer_birth_date');
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

function validBirthDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day || year < 1900) return false;
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return parsed.getTime() <= todayUtc;
}

async function saveSale(formData, { quiet = false } = {}) {
  if (!supabase || !session?.user) return null;
  const wasExisting = Boolean(currentSaleId);
  formData = withNormalizedPhones(formData);
  const record = saleRecord(formData);
  let result;
  if (currentSaleId) {
    const targetSaleId = currentSaleId;
    const { created_by, status, ...updateRecord } = record;
    const update = () => supabase
      .from('doc_sales')
      .update(updateRecord)
      .eq('id', targetSaleId)
      .select('id, status')
      .single();
    saleUpdatePromise = saleUpdatePromise.catch(() => null).then(update);
    result = await saleUpdatePromise;
  } else {
    // A second autosave can fire while the first insert is still in flight.
    // Wait for that insert, then update the same sale instead of creating a duplicate.
    if (saleInsertPromise) {
      await saleInsertPromise;
      return saveSale(formData, { quiet });
    }
    saleInsertPromise = supabase
      .from('doc_sales')
      .insert(record)
      .select('id, status')
      .single();
    try {
      result = await saleInsertPromise;
    } finally {
      saleInsertPromise = null;
    }
  }
  const { data, error } = result;
  if (error) throw error;
  setCurrentSale(data.id, data.status);
  if (!quiet) {
    const module = formData.sale_type === 'BANCO'
      ? 'bank'
      : formData.sale_type === 'REPO'
        ? 'repo'
        : formData.sale_type === 'VOLUNTARY'
          ? 'voluntary'
          : 'bhph';
    const { error: auditError } = await supabase.from('doc_sale_operations').insert({
      sale_id: data.id,
      module,
      event_type: wasExisting ? 'Venta guardada / actualizada' : 'Venta creada',
      status: 'Completado',
      follow_up_at: null,
      note: 'Datos generales del cliente, vehiculo y condiciones de la venta guardados en el expediente central.',
      payload: { sale_type: formData.sale_type || 'BHPH', source: 'sales_form' },
      created_by: session.user.id
    });
    if (auditError) {
      console.error('La venta se guardo, pero no pudo registrarse su asiento de auditoria.', auditError);
      setCloudStatus('Venta guardada. La bitacora de la venta no pudo actualizarse y requiere revision administrativa.', 'error');
    }
    await loadRecentSales();
    await loadArchive();
    await loadOpsReport();
  }
  return data;
}

async function saveInsuranceGpsEventAtomically(formData, rows) {
  formData = withNormalizedPhones(formData);
  clearTimeout(autosaveTimer);
  autosaveGeneration += 1;
  await saleUpdatePromise.catch(() => null);

  let sale = currentSaleId ? { id: currentSaleId } : null;
  if (!sale) {
    sale = await saveSale(formData, { quiet: true });
  }

  const record = saleRecord(formData);
  const { created_by, status, ...salePatch } = record;
  const { data, error } = await supabase.rpc('doc_save_insurance_gps_event', {
    target_sale_id: sale.id,
    sale_patch: salePatch,
    operation_rows: rows
  });
  if (error) throw error;

  setCurrentSale(sale.id);
  return { sale, operationId: data };
}

function scheduleAutoSave(formData) {
  if (!supabase || !session?.user) return;
  const hasIdentity = [formData.vin, formData.first_name, formData.last_name, formData.customer_email, formData.phone].some(value => String(value || '').trim());
  if (!hasIdentity) return;
  const targetSaleId = currentSaleId;
  const targetGeneration = autosaveGeneration;
  clearTimeout(autosaveTimer);
  autosaveTimer = window.setTimeout(() => {
    if (targetGeneration !== autosaveGeneration || targetSaleId !== currentSaleId) return;
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
  customer_birth_date: ['fecha nacimiento', 'fecha de nacimiento', 'birthdate', 'dateofbirth', 'dob'],
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
  data.customer_birth_date = inputDate(data.customer_birth_date);
  data.sale_type = 'BHPH';
  data.active_module = 'SALE';
  data.vehicle_loaded_date = importValue(row, headerMap, 'vehicle_loaded_date') || data.record_loaded_date || data.transaction_date;
  data.vehicle_loaded_date = inputDate(data.vehicle_loaded_date);
  data.insurance_first_review_date = data.vehicle_loaded_date || data.transaction_date;
  data.gps_first_review_date = data.vehicle_loaded_date || data.transaction_date;
  data.insurance_next_review_date = addDaysInput(data.insurance_first_review_date, 14);
  data.gps_next_review_date = addDaysInput(data.gps_first_review_date, 10);
  data.gap_has_coverage = yesNoGap(data.gap_has_coverage);
  data.insurance_status = '';
  data.gps_device_status = '';
  const monthlyMiles = Number(String(data.gps_monthly_miles || '').replace(/[^0-9.]/g, ''));
  if (Number.isFinite(monthlyMiles) && monthlyMiles > 0) {
    data.gps_monthly_miles_status = monthlyMiles > 1500 ? 'Sobre 1500 millas' : 'Dentro de limite';
  }
  return data;
}

async function importSalesFromCsv(file) {
  if (!supabase || !session?.user) throw new Error('Debes entrar con usuario autorizado antes de importar.');
  if (!file) throw new Error('Selecciona un archivo CSV.');
  if (file.size > 5 * 1024 * 1024) throw new Error('El archivo supera el limite de 5 MB.');
  const fileBuffer = await file.arrayBuffer();
  const sourceSha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', fileBuffer))]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
  const rows = parseCsv(new TextDecoder().decode(fileBuffer));
  if (rows.length < 2) throw new Error('El CSV debe tener encabezados y al menos una fila.');
  if (rows.length > 1001) throw new Error('Cada carga admite un maximo de 1000 clientes. Divide el archivo en dos lotes.');
  const headers = rows[0].map(normalizeHeader);
  const headerMap = new Map(headers.map((header, index) => [header, index]));
  const imported = rows.slice(1)
    .map((row, index) => ({ formData: formDataFromImport(row, headerMap), sourceRowNumber: index + 2 }))
    .filter(({ formData }) => {
      const name = [formData.first_name, formData.last_name].filter(Boolean).join(' ');
      return formData.vin || name || formData.customer_email || formData.phone;
    });
  if (!imported.length) throw new Error('No encontre filas con cliente o VIN para cargar.');

  const vins = [...new Set(imported.map(({ formData }) => formData.vin).filter(Boolean))];
  const stocksByVin = new Map();
  for (let offset = 0; offset < vins.length; offset += 100) {
    const { data, error } = await supabase
      .from('doc_sales')
      .select('vin, stock_number')
      .in('vin', vins.slice(offset, offset + 100));
    if (error) throw error;
    (data || []).forEach(item => {
      const vin = cleanVin(item.vin);
      if (!vin) return;
      if (!stocksByVin.has(vin)) stocksByVin.set(vin, new Set());
      stocksByVin.get(vin).add(String(item.stock_number || '').trim().toUpperCase());
    });
  }

  const validatedRows = [];
  const errors = [];
  let historicalVinWarnings = 0;
  imported.forEach(({ formData, sourceRowNumber }) => {
    const rowErrors = [];
    const warnings = [];
    const customerName = [formData.first_name, formData.middle_name, formData.last_name, formData.second_last_name].filter(Boolean).join(' ').trim();
    const vin = cleanVin(formData.vin);
    const stock = String(formData.stock_number || '').trim().toUpperCase();

    if (!customerName) rowErrors.push('falta el nombre del cliente');
    if (vin.length !== 17) rowErrors.push('el VIN debe tener 17 caracteres');
    if (!stock) rowErrors.push('falta el stock');
    if (!formData.transaction_date) warnings.push('fecha de venta pendiente');
    if (!validBirthDate(formData.customer_birth_date)) warnings.push('fecha de nacimiento pendiente');
    if (!normalizePhoneForSms(formData.phone)) warnings.push('telefono pendiente o sin codigo de pais valido');

    const priorStocks = stocksByVin.get(vin) || new Set();
    const unverifiable = priorStocks.size > 0 && (!stock || priorStocks.has(''));
    const exactDuplicate = stock && priorStocks.has(stock);
    if (unverifiable || exactDuplicate) {
      rowErrors.push('ya existe ese VIN con el mismo stock o con stock sin confirmar');
    }
    if (!rowErrors.length && priorStocks.size > 0) {
      historicalVinWarnings += 1;
      warnings.push('VIN historico: existe otra venta con stock diferente');
    }

    if (rowErrors.length) {
      errors.push(`Fila ${sourceRowNumber}: ${rowErrors.join('; ')}`);
      return;
    }

    if (!stocksByVin.has(vin)) stocksByVin.set(vin, new Set());
    stocksByVin.get(vin).add(stock);
    validatedRows.push({
      source_row_number: sourceRowNumber,
      record: saleRecord(formData),
      warnings
    });
  });

  if (errors.length) {
    const preview = errors.slice(0, 12).join(' | ');
    const remainder = errors.length > 12 ? ` | y ${errors.length - 12} error(es) adicionales` : '';
    throw new Error(`Carga cancelada sin guardar datos. ${preview}${remainder}.`);
  }
  if (!validatedRows.length) throw new Error('No quedaron filas validas para cargar.');

  const { data, error } = await supabase.rpc('doc_import_sales_batch', {
    source_file_name: file.name,
    source_file_sha256: sourceSha256,
    import_rows: validatedRows
  });
  if (error) throw error;
  await loadRecentSales();
  await loadArchive();
  await loadOpsReport();
  return {
    inserted: Number(data?.inserted || validatedRows.length),
    warnings: Number(data?.warnings || 0),
    historicalVinWarnings,
    batchId: data?.batch_id || ''
  };
}

async function rollbackImportBatch(batch) {
  if (currentProfileRole !== 'admin') return;
  const confirmed = window.confirm(`Revertir la carga ${batch.source_file_name} de ${batch.imported_rows} expediente(s)? Solo se permite si ninguno tiene firmas, documentos ni seguimiento.`);
  if (!confirmed) return;
  const { data, error } = await supabase.rpc('doc_rollback_import_batch', {
    target_batch_id: batch.id
  });
  if (error) throw error;
  controls.importStatus.textContent = `Carga revertida de forma controlada: ${Number(data || 0)} expediente(s) retirados. El historial del lote permanece disponible.`;
  controls.importStatus.className = 'status good';
  await Promise.all([loadImportBatches(), loadRecentSales(), loadArchive(), loadOpsReport()]);
}

async function loadImportBatches() {
  if (!controls.importHistory || !supabase || !session?.user) return;
  const { data, error } = await supabase
    .from('doc_import_batches')
    .select('id, source_file_name, source_sha256, total_rows, imported_rows, warning_count, status, created_at, completed_at, rolled_back_at, created_by')
    .order('created_at', { ascending: false })
    .limit(20);
  controls.importHistory.replaceChildren();
  if (error) {
    const message = document.createElement('p');
    message.className = 'status warn';
    message.textContent = 'No se pudo consultar el historial de cargas.';
    controls.importHistory.append(message);
    return;
  }
  if (!data?.length) {
    const empty = document.createElement('p');
    empty.className = 'status';
    empty.textContent = 'Todavia no hay cargas masivas registradas.';
    controls.importHistory.append(empty);
    return;
  }
  data.forEach(batch => {
    const row = document.createElement('div');
    row.className = 'admin-user-row';
    const identity = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = batch.source_file_name;
    const reference = document.createElement('div');
    reference.textContent = `Lote ${batch.id.slice(0, 8)} | Huella ${batch.source_sha256.slice(0, 12)}`;
    identity.append(name, reference);
    const totals = document.createElement('div');
    totals.textContent = `${batch.imported_rows}/${batch.total_rows} expedientes | ${batch.warning_count} advertencias`;
    const state = document.createElement('div');
    state.textContent = batch.status === 'completed'
      ? `Completada ${new Date(batch.completed_at || batch.created_at).toLocaleString('en-US')}`
      : batch.status === 'rolled_back'
        ? `Revertida ${new Date(batch.rolled_back_at || batch.created_at).toLocaleString('en-US')}`
        : 'Procesando';
    row.append(identity, totals, state);
    if (currentProfileRole === 'admin' && batch.status === 'completed') {
      const rollback = document.createElement('button');
      rollback.type = 'button';
      rollback.className = 'secondary';
      rollback.textContent = 'Revertir lote';
      rollback.addEventListener('click', () => rollbackImportBatch(batch).catch(importError => {
        controls.importStatus.textContent = `No se puede revertir: ${importError.message}`;
        controls.importStatus.className = 'status warn';
      }));
      row.append(rollback);
    }
    controls.importHistory.append(row);
  });
}

function downloadImportTemplate() {
  const headers = [
    'nombre', 'apellido', 'telefono', 'email', 'fecha_nacimiento', 'direccion', 'ciudad', 'estado', 'zip',
    'VIN', 'ano', 'marca', 'modelo', 'millas', 'color', 'placa', 'stock',
    'contrato', 'fecha_venta', 'fecha_carga', 'seguro', 'poliza', 'vence_poliza',
    'gps_imei', 'proveedor_gps', 'ubicacion_gps', 'estado_ubicacion_gps', 'millas_mensuales_gps', 'gap'
  ];
  const csv = `${headers.join(',')}\n`;
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
  'insurance_issue_date', 'insurance_customer_role', 'insurance_policyholder_name',
  'insurance_policyholder_relationship', 'insurance_policyholder_address',
  'insurance_driver_listed', 'insurance_driver_name_on_policy', 'insurance_driver_address',
  'insurance_address_review_status', 'insurance_gps_address_match', 'insurance_address_follow_up_notes',
  'insurance_address_matches', 'insurance_policy_address', 'insurance_party_schema_version', 'insurance_cancelled_since',
  'insurance_status', 'insurance_verified_date', 'insurance_next_review_date',
  'insurance_expiration_date', 'insurance_payments_current',
  'insurance_comprehensive', 'insurance_collision', 'insurance_lienholder', 'insurance_status_reason', 'insurance_follow_up_path',
  'gps_imei', 'gps_provider',
  'gps_device_status', 'gps_battery_connected',
  'gps_last_mileage', 'gps_last_location', 'gps_location_jurisdiction', 'gps_last_seen_at', 'gps_overnight_location', 'gps_status_reason',
  'gps_next_review_date', 'gps_monthly_miles', 'gps_monthly_miles_status',
  'recovery_event_type', 'recovery_event_date', 'recovery_last_location',
  'recovery_policy_active_on_event', 'recovery_repo_confirmed', 'recovery_damage_notes',
  'gap_has_coverage', 'gap_provider', 'gap_contract_number', 'gap_issued_vin',
  'gap_vin_match', 'gap_issue_date', 'gap_contract_status',
  'gap_claim_status', 'insurance_claim_number', 'gap_claim_number', 'gap_opened_date',
  'insurance_claim_last_call_date', 'gap_last_call_date', 'claim_pending_action', 'gap_missing_documents',
  'ops_action_type', 'ops_contact_result',
  'ops_next_action', 'ops_next_action_date', 'ops_next_action_time', 'insurance_gps_notes'
];

function insuranceGpsPayload(formData) {
  return insuranceGpsFields.reduce((payload, field) => {
    payload[field] = formData[field] || '';
    return payload;
  }, {
    customer_name: [formData.first_name, formData.middle_name, formData.last_name, formData.second_last_name].filter(Boolean).join(' '),
    customer_phone: formData.phone || '',
    customer_email: formData.customer_email || '',
    customer_birth_date: formData.customer_birth_date || '',
    vehicle: [formData.vehicle_year, formData.vehicle_make, formData.vehicle_model].filter(Boolean).join(' '),
    vin: formData.vin || '',
    stock_number: formData.stock_number || '',
    contract_number: formData.contract_number || '',
    transaction_date: formData.transaction_date || ''
  });
}

function policyPartyIssue(formData = {}) {
  if (!formData.insurance_policy_number) return false;
  if (String(formData.insurance_party_schema_version || '') !== '2') return false;
  const driverUnconfirmed = formData.insurance_customer_role === 'Conductor agregado'
    && formData.insurance_driver_listed !== 'Si';
  return !formData.insurance_customer_role
    || !String(formData.insurance_policyholder_name || '').trim()
    || !String(formData.insurance_policyholder_address || '').trim()
    || (formData.insurance_customer_role === 'Conductor agregado'
      && (!String(formData.insurance_driver_name_on_policy || '').trim()
        || !String(formData.insurance_driver_address || '').trim()))
    || driverUnconfirmed
    || !['Coinciden', 'Diferencia explicada'].includes(formData.insurance_address_review_status)
    || formData.insurance_gps_address_match === 'No coincide';
}

function validatePolicyParties(formData = {}) {
  if (!formData.insurance_policy_number) return;
  if (!formData.insurance_customer_role) {
    throw new Error('Indica si el cliente es titular de la poliza o conductor agregado.');
  }
  if (!String(formData.insurance_policyholder_name || '').trim() || !String(formData.insurance_policyholder_address || '').trim()) {
    throw new Error('Registra el nombre y la direccion del titular de la poliza.');
  }
  if (formData.insurance_customer_role === 'Conductor agregado') {
    if (!formData.insurance_driver_listed) {
      throw new Error('Indica si el cliente aparece expresamente como conductor autorizado en la poliza.');
    }
    if (formData.insurance_driver_listed === 'Si' && !String(formData.insurance_driver_name_on_policy || '').trim()) {
      throw new Error('Registra el nombre exacto del cliente conductor que aparece en la poliza.');
    }
    if (!String(formData.insurance_driver_address || '').trim()) {
      throw new Error('Registra el nombre exacto y la direccion del cliente conductor que aparecen en la poliza.');
    }
  }
  if (!formData.insurance_address_review_status) {
    throw new Error('Registra el resultado de la comparacion de direcciones.');
  }
  if ((formData.insurance_customer_role === 'Conductor agregado' && formData.insurance_driver_listed !== 'Si')
      || ['Pendiente de verificar', 'Inconsistencia critica'].includes(formData.insurance_address_review_status)
      || formData.insurance_gps_address_match === 'No coincide') {
    if (!String(formData.insurance_address_follow_up_notes || '').trim()) {
      throw new Error('La diferencia de direcciones requiere una nota de seguimiento y comprobacion.');
    }
  }
}

function insuranceGpsDraftPending(formData = {}) {
  const pending = [];
  if (!validBirthDate(formData.customer_birth_date)) pending.push('fecha de nacimiento');
  if (!formData.insurance_policy_number) pending.push('numero de poliza');
  if (formData.insurance_policy_number) {
    if (!formData.insurance_customer_role) pending.push('titular o conductor de la poliza');
    if (!String(formData.insurance_policyholder_name || '').trim()) pending.push('nombre del titular');
    if (!String(formData.insurance_policyholder_address || '').trim()) pending.push('direccion del titular');
    if (!formData.insurance_address_review_status) pending.push('comparacion de direcciones');
    if (!formData.insurance_status) pending.push('estatus del seguro');
  }
  if (!formData.gps_imei) pending.push('numero o IMEI del GPS');
  if (!formData.gps_provider) pending.push('proveedor GPS');
  if (!formData.gps_device_status) pending.push('estatus del GPS');
  return [...new Set(pending)];
}

async function saveInsuranceGpsReview(formData) {
  if (!supabase || !session?.user) return null;
  if (!validBirthDate(formData.customer_birth_date)) throw new Error('Registra una fecha de nacimiento valida antes de verificar Seguro y GPS.');
  if (!formData.ops_action_type) throw new Error('Selecciona la accion del operador antes de registrar.');
  if (!formData.ops_contact_result) throw new Error('Selecciona el resultado de la accion antes de registrar.');
  if (String(formData.insurance_gps_notes || '').trim().length < 12) {
    throw new Error('La nota de auditoria debe explicar que se verifico y que queda pendiente.');
  }
  const isInsuranceAction = ['Verificacion seguro', 'Llamada seguro'].includes(formData.ops_action_type);
  const isGpsAction = ['Verificacion GPS', 'Revision GPS'].includes(formData.ops_action_type);
  const gpsIssue = !formData.gps_imei
    || ['Inactivo', 'Desconectado'].includes(formData.gps_device_status)
    || ['No', 'No confirmado'].includes(formData.gps_battery_connected)
    || formData.gps_location_jurisdiction === 'Fuera de Florida'
    || formData.gps_location_jurisdiction === 'Por confirmar'
    || formData.gps_monthly_miles_status === 'Sobre 1500 millas';
  const insuranceIssue = !formData.insurance_policy_number
    || formData.insurance_status === 'Activo pending'
    || ['Cancelado', 'Vencido'].includes(formData.insurance_status)
    || formData.insurance_payments_current !== 'Si'
    || formData.insurance_comprehensive !== 'Si'
    || formData.insurance_collision !== 'Si'
    || formData.insurance_lienholder !== 'Si'
    || policyPartyIssue(formData)
    || formData.insurance_address_matches !== 'Si'
    || isPastDue(formData.insurance_expiration_date);
  if (((isInsuranceAction && insuranceIssue) || (isGpsAction && gpsIssue)) && !String(formData.ops_next_action || '').trim()) {
    throw new Error('Hay una irregularidad de seguro o GPS. Define la proxima accion del operador.');
  }
  if (String(formData.ops_next_action || '').trim() && !formData.ops_next_action_date) {
    throw new Error('La proxima accion requiere una fecha para la agenda del operador.');
  }
  if (isInsuranceAction && insuranceIssue && !String(formData.insurance_status_reason || '').trim()) {
    throw new Error('Explica el motivo o resultado de la verificacion de poliza.');
  }
  if (isGpsAction && gpsIssue && !String(formData.gps_status_reason || '').trim()) {
    throw new Error('Explica el motivo o seguimiento requerido para la alerta GPS.');
  }
  if (formData.insurance_status === 'Cancelado' && !formData.insurance_cancelled_since) {
    throw new Error('Indica desde que fecha la poliza esta cancelada.');
  }
  if (['Cancelado', 'Vencido'].includes(formData.insurance_status) && !formData.insurance_follow_up_path) {
    throw new Error('Selecciona la ruta de seguimiento: contactar cliente, proceso de reposicion, reposicion o siniestro.');
  }
  if (formData.insurance_address_matches === 'No' && !String(formData.insurance_policy_address || '').trim()) {
    throw new Error('La direccion no coincide. Registra la direccion que aparece en la poliza.');
  }
  if (isInsuranceAction) validatePolicyParties(formData);
  if (formData.insurance_follow_up_path === 'Proceso de reposicion' && !formData.recovery_last_location) {
    throw new Error('En proceso de reposicion verifica el GPS y registra la ultima ubicacion del carro.');
  }
  const repoConfirmed = formData.recovery_event_type === 'Repo' && formData.recovery_repo_confirmed === 'Si';
  if (formData.recovery_event_type === 'Repo') {
    if (!formData.recovery_event_date || !formData.recovery_last_location || !formData.recovery_policy_active_on_event || !formData.recovery_repo_confirmed) {
      throw new Error('Para reposicion registra fecha, ultima ubicacion, poliza activa ese dia y confirmacion del carro en dealer.');
    }
  }
  const payload = insuranceGpsPayload(formData);
  const status = formData.ops_contact_result || formData.insurance_status || formData.gps_device_status || formData.gap_claim_status || 'Registrado';
  const followUpAt = repoConfirmed ? null : (formData.ops_next_action_date
    || (isInsuranceAction ? formData.insurance_next_review_date : isGpsAction ? formData.gps_next_review_date : formData.insurance_next_review_date || formData.gps_next_review_date || null));
  const rows = [{
    module: 'insurance_gps',
    event_type: repoConfirmed ? 'Reposicion confirmada' : formData.ops_action_type || formData.recovery_event_type || 'revision_realizada',
    status,
    follow_up_at: followUpAt,
    note: formData.insurance_gps_notes || null,
    payload,
    created_by: session.user.id
  }];
  // Each scheduled review is retained as an audit entry. The current due date
  // is read from the sale record, so replacing it never requires deleting history.
  if (!repoConfirmed && isInsuranceAction && formData.insurance_next_review_date) {
    rows.push({
      module: 'insurance_gps',
      event_type: 'proxima_revision_seguro',
      status: 'Pendiente',
      follow_up_at: formData.insurance_next_review_date,
      note: 'Accion automatica: verificar poliza, comprehensive, collision, pagos al dia y EasyCar como lien holder.',
      payload,
      created_by: session.user.id
    });
  }
  if (!repoConfirmed && isGpsAction && formData.gps_next_review_date) {
    rows.push({
      module: 'insurance_gps',
      event_type: 'proxima_revision_gps',
      status: 'Pendiente',
      follow_up_at: formData.gps_next_review_date,
      note: 'Accion automatica: verificar GPS activo, conexion a bateria, millas, ubicacion y senal.',
      payload,
      created_by: session.user.id
    });
  }
  const { sale, operationId } = await saveInsuranceGpsEventAtomically(formData, rows);
  await loadSaleOperationHistory(sale.id);
  await loadArchive();
  await loadOpsReport();
  return operationId ? { id: operationId } : null;
}

async function saveInsuranceGpsIdentification(formData) {
  if (!supabase || !session?.user) return null;
  const hasCaseIdentity = [formData.first_name, formData.last_name, formData.vin, formData.stock_number]
    .some(value => String(value || '').trim());
  if (!hasCaseIdentity) throw new Error('Identifica al cliente o al vehiculo antes de guardar el borrador.');
  formData.insurance_status = normalizedInsuranceStatus(formData);
  if (formData.insurance_status === 'Activo OK') {
    formData.insurance_payments_current = 'Si';
    formData.insurance_comprehensive = 'Si';
    formData.insurance_collision = 'Si';
    formData.insurance_lienholder = 'Si';
  }
  if (formData.insurance_status === 'Activo pending') {
    formData.insurance_payments_current = '';
    formData.insurance_comprehensive = '';
    formData.insurance_collision = '';
    formData.insurance_lienholder = '';
  }
  const payload = insuranceGpsPayload(formData);
  const status = [formData.insurance_status, formData.gps_device_status].filter(Boolean).join(' / ') || 'Pendiente de verificacion';
  const note = 'Identificacion o actualizacion inicial de seguro/GPS guardada en el expediente.';
  const rows = [{
      module: 'insurance_gps',
      event_type: 'Identificacion / actualizacion GPS y seguro',
      status,
      follow_up_at: formData.insurance_next_review_date || formData.gps_next_review_date || null,
      note,
      payload,
      created_by: session.user.id
  }];
  const { sale } = await saveInsuranceGpsEventAtomically(formData, rows);
  await loadSaleOperationHistory(sale.id);
  await loadArchive();
  await loadOpsReport();
  return sale;
}

function mechanicalPayload(formData) {
  return {
    customer_name: [formData.first_name, formData.middle_name, formData.last_name, formData.second_last_name].filter(Boolean).join(' '),
    vehicle: [formData.vehicle_year, formData.vehicle_make, formData.vehicle_model].filter(Boolean).join(' '),
    vin: formData.vin || '',
    stock_number: formData.stock_number || '',
    mechanical_status: formData.mechanical_status || '',
    mechanical_mileage_at_review: formData.mechanical_mileage_at_review || '',
    mechanical_issues_found: formData.mechanical_issues_found || '',
    mechanical_action_taken: formData.mechanical_action_taken || '',
    mechanical_notes: formData.mechanical_notes || ''
  };
}

async function saveMechanicalReview(formData) {
  if (!supabase || !session?.user) return null;
  const hasCaseIdentity = [formData.first_name, formData.last_name, formData.vin, formData.stock_number]
    .some(value => String(value || '').trim());
  if (!hasCaseIdentity) throw new Error('Identifica al cliente o al vehiculo antes de registrar la revision mecanica.');
  if (!formData.mechanical_status) throw new Error('Selecciona el estatus mecanico antes de registrar.');
  if (String(formData.mechanical_notes || '').trim().length < 12) {
    throw new Error('La nota debe explicar que se reviso y que queda pendiente (minimo 12 caracteres).');
  }
  const payload = mechanicalPayload(formData);
  const rows = [{
    module: 'mechanical',
    event_type: 'revision_mecanica',
    status: formData.mechanical_status,
    follow_up_at: formData.mechanical_next_review_date || null,
    note: formData.mechanical_notes,
    payload,
    created_by: session.user.id
  }];
  const { sale } = await saveInsuranceGpsEventAtomically(formData, rows);
  await loadSaleOperationHistory(sale.id);
  await loadArchive();
  return sale;
}

function interviewPayload(formData) {
  return {
    customer_name: [formData.first_name, formData.middle_name, formData.last_name, formData.second_last_name].filter(Boolean).join(' '),
    employer_name: formData.employer_name || '',
    employer_phone: formData.employer_phone || '',
    employer_position: formData.employer_position || '',
    employer_length: formData.employer_length || '',
    personal_ref1_name: formData.personal_ref1_name || '',
    personal_ref1_phone: formData.personal_ref1_phone || '',
    personal_ref1_relationship: formData.personal_ref1_relationship || '',
    personal_ref2_name: formData.personal_ref2_name || '',
    personal_ref2_phone: formData.personal_ref2_phone || '',
    personal_ref2_relationship: formData.personal_ref2_relationship || '',
    interview_call_date: formData.interview_call_date || '',
    interview_call_result: formData.interview_call_result || ''
  };
}

async function saveInterviewCall(formData) {
  if (!supabase || !session?.user) return null;
  const hasCaseIdentity = [formData.first_name, formData.last_name, formData.vin, formData.stock_number]
    .some(value => String(value || '').trim());
  if (!hasCaseIdentity) throw new Error('Identifica al cliente o al vehiculo antes de registrar la llamada de entrevista.');
  if (!formData.interview_call_result) throw new Error('Selecciona el resultado de la llamada antes de registrar.');
  if (String(formData.interview_notes || '').trim().length < 12) {
    throw new Error('La nota debe explicar que se confirmo y que queda pendiente (minimo 12 caracteres).');
  }
  const payload = interviewPayload(formData);
  const rows = [{
    // El valor de modulo en base de datos es 'survey' (asi quedo reservado en el
    // CHECK constraint desde antes de construir este modulo); la UI y el campo
    // active_module usan 'INTERVIEW', pero el registro de auditoria debe usar 'survey'.
    module: 'survey',
    event_type: 'llamada_confirmacion',
    status: formData.interview_call_result,
    follow_up_at: formData.interview_next_action_date || null,
    note: formData.interview_notes,
    payload,
    created_by: session.user.id
  }];
  const { sale } = await saveInsuranceGpsEventAtomically(formData, rows);
  await loadSaleOperationHistory(sale.id);
  await loadArchive();
  return sale;
}

async function loadSale(id, { module = '', scrollTarget = 'clientSection' } = {}) {
  const { data, error } = await supabase.from('doc_sales').select('*').eq('id', id).single();
  if (error) throw error;
  const formData = { ...(data.form_data || {}) };
  formData.insurance_status = normalizedInsuranceStatus(formData);
  app.loadFormData(formData);
  if (module === 'INSURANCE_GPS') app.setActiveModule?.('INSURANCE_GPS');
  setCurrentSale(data.id, data.status);
  await loadSaleOperationHistory(data.id);
  setCloudStatus(`Venta de ${data.customer_name || 'cliente'} abierta desde el expediente central.`, 'good');
  const target = document.getElementById(scrollTarget);
  if (target) {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => target.scrollIntoView({ behavior: 'auto', block: 'start' }));
    });
  }
  return data;
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
    declined: 'Rechazada', expired: 'Expirada', void: 'Anulada'
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
    .select('id, customer_id, customer_name, vehicle_description, status, transaction_date')
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
    open.textContent = 'Ver ficha';
    open.addEventListener('click', () => showCustomerCaseFile(sale.customer_id, sale.id));
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

function groupSalesByCustomer(sales) {
  const groups = new Map();
  sales.forEach(sale => {
    const key = sale.customer_id || `sale-${sale.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(sale);
  });
  return [...groups.values()];
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

  groupSalesByCustomer(sales).forEach(group => {
    const primary = group[0];
    const multi = group.length > 1;
    const row = document.createElement('details');
    row.className = 'archive-row';

    const summary = document.createElement('summary');
    summary.className = 'archive-summary';

    const customer = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = primary.customer_name || 'Cliente sin nombre';
    const details = document.createElement('div');
    details.className = 'archive-meta';
    details.textContent = [
      primary.customer_email,
      primary.customer_phone,
      multi ? `${group.length} ventas` : (primary.contract_number ? `Contrato ${primary.contract_number}` : '')
    ].filter(Boolean).join(' | ');
    customer.append(name, details);

    const vehicle = document.createElement('div');
    const vehicleName = document.createElement('strong');
    vehicleName.textContent = multi
      ? group.map(sale => sale.vehicle_description || 'Vehiculo sin completar').join(' + ')
      : (primary.vehicle_description || 'Vehiculo sin completar');
    const vehicleMeta = document.createElement('div');
    vehicleMeta.className = 'archive-meta';
    vehicleMeta.textContent = multi ? '' : [
      primary.vin ? `VIN ${primary.vin}` : '',
      primary.stock_number ? `Stock ${primary.stock_number}` : ''
    ].filter(Boolean).join(' | ');
    vehicle.append(vehicleName, vehicleMeta);

    const status = document.createElement('div');
    status.className = 'archive-meta';
    status.textContent = multi
      ? `${group.length} expedientes`
      : `${saleTypeLabel(primary.form_data)} | ${statusLabel(primary.status)}${primary.transaction_date ? ` | ${formatDateDisplay(primary.transaction_date)}` : ''}`;

    const expanded = document.createElement('div');
    expanded.className = 'archive-expanded';
    const docs = document.createElement('div');
    docs.className = 'archive-docs';
    const documents = group.flatMap(sale => sale.doc_sale_documents || []);
    if (!documents.length) {
      const pending = document.createElement('span');
      pending.className = 'archive-meta';
      pending.textContent = group.some(sale => sale.status === 'signed_digital')
        ? 'Firmado, pendiente de archivo PDF'
        : 'Aun no hay PDF firmado archivado';
      docs.append(pending);
    } else {
      documents.forEach((archivedDocument, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'secondary';
        button.textContent = archivedDocument.original_name || `Documento firmado ${index + 1}`;
        button.addEventListener('click', () => openArchivedDocument(archivedDocument.storage_path).catch(error => setCloudStatus(error.message, 'error')));
        docs.append(button);
      });
    }

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'secondary';
    open.textContent = 'Ver ficha completa';
    open.addEventListener('click', () => showCustomerCaseFile(primary.customer_id, primary.id));
    docs.prepend(open);

    if (!multi) {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'secondary';
      edit.textContent = 'Editar venta';
      edit.addEventListener('click', () => loadSale(primary.id, { scrollTarget: 'clientSection' }).catch(error => setCloudStatus(error.message, 'error')));
      docs.insertBefore(edit, docs.children[1] || null);
    }

    summary.append(customer, vehicle, status);
    expanded.append(docs);
    row.append(summary, expanded);
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
      .select('id, customer_id, customer_name, customer_email, customer_phone, vehicle_description, vin, stock_number, contract_number, transaction_date, status, form_data, created_at, doc_sale_documents(id, document_type, storage_path, original_name, created_at)')
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (term) {
      const safeTerm = term.replace(/[%_,]/g, ' ');
      const pattern = `%${safeTerm}%`;
      query = query.or(`customer_name.ilike.${pattern},customer_email.ilike.${pattern},customer_phone.ilike.${pattern},vehicle_description.ilike.${pattern},vin.ilike.${pattern},stock_number.ilike.${pattern},contract_number.ilike.${pattern}`);
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

async function checkDuplicateVin(vin, stockNumber = '') {
  if (!supabase || !session?.user) return { ready: false, duplicate: false, critical: false, matches: [] };
  const clean = cleanVin(vin);
  if (clean.length !== 17) return { ready: true, duplicate: false, critical: false, matches: [] };
  const { data, error } = await supabase
    .from('doc_sales')
    .select('id, customer_name, vehicle_description, stock_number, contract_number, transaction_date, status')
    .eq('vin', clean)
    .order('created_at', { ascending: false })
    .limit(6);
  if (error) throw error;
  const matches = (data || []).filter(sale => sale.id !== currentSaleId);
  const currentStock = String(stockNumber || '').trim().toUpperCase();
  const critical = matches.some(sale => {
    const priorStock = String(sale.stock_number || '').trim().toUpperCase();
    return !currentStock || !priorStock || priorStock === currentStock;
  });
  return { ready: true, duplicate: matches.length > 0, critical, matches };
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
      'cliente', 'email', 'telefono', 'fecha_nacimiento', 'direccion', 'ciudad', 'estado', 'zip',
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
        form.customer_birth_date,
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

function normalizedInsuranceStatus(form = {}) {
  if (form.insurance_status !== 'Activo') return form.insurance_status || '';
  const legacyPolicyComplete = form.insurance_payments_current === 'Si'
    && form.insurance_comprehensive === 'Si'
    && form.insurance_collision === 'Si'
    && form.insurance_lienholder === 'Si'
    && !policyPartyIssue(form)
    && form.insurance_address_matches === 'Si'
    && !isPastDue(form.insurance_expiration_date);
  return legacyPolicyComplete ? 'Activo OK' : 'Activo pending';
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
  return latestOperation(operations.filter(isOperatorAction));
}

function latestMechanicalReview(operations = []) {
  return latestOperation(operations.filter(operation => operation.module === 'mechanical'));
}

function latestInterviewCall(operations = []) {
  return latestOperation(operations.filter(operation => operation.module === 'survey'));
}

function buildOpsProfile(sale, operations = [], activities = []) {
  const form = { ...(sale.form_data || {}) };
  form.insurance_status = normalizedInsuranceStatus(form);
  const latest = latestOperatorOperation(operations);
  const latestInsuranceReview = latestOperation(operations.filter(operation =>
    !String(operation.event_type || '').startsWith('proxima_revision_')
    && /verificacion seguro|llamada seguro/i.test(`${operation.event_type || ''} ${operation.payload?.ops_action_type || ''}`)));
  const latestGpsReview = latestOperation(operations.filter(operation =>
    !String(operation.event_type || '').startsWith('proxima_revision_')
    && /verificacion gps|revision gps/i.test(`${operation.event_type || ''} ${operation.payload?.ops_action_type || ''}`)));
  const lastInsuranceReviewSource = latestInsuranceReview?.created_at || form.insurance_verified_date || form.insurance_first_review_date || form.vehicle_loaded_date || sale.transaction_date || sale.created_at;
  const lastGpsReviewSource = latestGpsReview?.created_at || form.gps_first_review_date || form.vehicle_loaded_date || sale.transaction_date || sale.created_at;
  const insuranceDaysSince = daysBetween(lastInsuranceReviewSource);
  const gpsDaysSince = daysBetween(lastGpsReviewSource);
  const insuranceOverdue = insuranceDaysSince === null || insuranceDaysSince > 14 || isPastDue(form.insurance_next_review_date);
  const gpsOverdue = gpsDaysSince === null || gpsDaysSince > 10 || isPastDue(form.gps_next_review_date);
  const insuranceCancelled = form.insurance_status === 'Cancelado';
  const insurancePending = form.insurance_status === 'Activo pending';
  const insuranceInvalidated = false;
  const insuranceExpired = form.insurance_status === 'Vencido' || isPastDue(form.insurance_expiration_date);
  const insuranceRepossession = form.recovery_event_type === 'Repo';
  const repoConfirmed = insuranceRepossession && form.recovery_repo_confirmed === 'Si';
  const insuranceCancelledDays = insuranceCancelled ? daysBetween(form.insurance_cancelled_since) : null;
  const policyProblem = !form.insurance_policy_number
    || insurancePending
    || ['Cancelado', 'Vencido'].includes(form.insurance_status)
    || form.insurance_comprehensive !== 'Si'
    || form.insurance_collision !== 'Si'
    || form.insurance_lienholder !== 'Si'
    || form.insurance_payments_current !== 'Si'
    || policyPartyIssue(form)
    || form.insurance_address_matches !== 'Si'
    || isPastDue(form.insurance_expiration_date)
    || insuranceOverdue;
  const gpsMissing = !form.gps_imei;
  const gpsOutsideFlorida = form.gps_location_jurisdiction === 'Fuera de Florida';
  const gpsLocationUnconfirmed = Boolean(form.gps_last_location) && !form.gps_location_jurisdiction
    || form.gps_location_jurisdiction === 'Por confirmar';
  const gpsMileageExceeded = form.gps_monthly_miles_status === 'Sobre 1500 millas'
    || Number(String(form.gps_monthly_miles || '').replace(/[^0-9.]/g, '')) > 1500;
  const gpsProblem = gpsMissing
    || ['Inactivo', 'Desconectado'].includes(form.gps_device_status)
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
  const gapProblem = form.gap_has_coverage === 'No confirmado'
    || (form.gap_has_coverage === 'Si' && (!form.gap_provider || !form.gap_contract_number || !form.gap_issued_vin))
    || gapVinMismatch
    || form.gap_vin_match === 'No'
    || form.gap_vin_match === 'No confirmado'
    || ['Cancelado', 'No emitido', 'No verificable'].includes(form.gap_contract_status);
  const recoveryOpen = Boolean(form.recovery_event_type && form.recovery_event_type !== 'Ninguno') || insuranceRepossession;
  const siniestroOpen = form.recovery_event_type === 'Siniestro' || insuranceClaimOpen;
  const gapClaimOpen = ['GAP abierto', 'Esperando pago GAP'].includes(form.gap_claim_status);
  const daysSinceOps = daysBetween(latest?.created_at);
  const saleAgeDays = daysBetween(sale.created_at);
  const noteProblem = Boolean(latest) && (!String(latest.note || '').trim() || String(latest.note || '').trim().length < 12);
  const noFollowUp = latest
    ? daysSinceOps !== null && daysSinceOps > 14
    : saleAgeDays !== null && saleAgeDays >= 1;
  const overdue = !repoConfirmed && (insuranceOverdue || gpsOverdue || (gapClaimDays !== null && gapClaimDays > 7) || (insuranceClaimDays !== null && insuranceClaimDays > 7));
  const unscheduledIssue = !repoConfirmed && ((policyProblem && !form.insurance_next_review_date)
    || (gpsProblem && !form.gps_next_review_date)
    || (gapOpen && !form.gap_last_call_date)
    || (insuranceClaimOpen && !form.insurance_claim_last_call_date));
  const dueToday = !repoConfirmed && (unscheduledIssue
    || isDueTodayOrEarlier(form.insurance_next_review_date)
    || isDueTodayOrEarlier(form.gps_next_review_date)
    || (gapOpen && (gapClaimDays === null || gapClaimDays >= 7))
    || (insuranceClaimOpen && (insuranceClaimDays === null || insuranceClaimDays >= 7)));
  const alerts = [];
  const partyClassificationPending = Boolean(form.insurance_policy_number)
    && String(form.insurance_party_schema_version || '') !== '2';
  if (!form.customer_birth_date) alerts.push('Fecha de nacimiento pendiente');
  if (!form.insurance_policy_number) alerts.push('Seguro por configurar');
  else if (policyProblem) alerts.push(insuranceOverdue ? `Seguro sin revisar ${daysText(insuranceDaysSince)}` : 'Seguro requiere accion');
  if (partyClassificationPending) alerts.push('Clasificacion titular/conductor pendiente');
  if (form.insurance_customer_role === 'Conductor agregado' && form.insurance_driver_listed !== 'Si') alerts.push('Cliente no confirmado como conductor');
  if (['Pendiente de verificar', 'Inconsistencia critica'].includes(form.insurance_address_review_status)) alerts.push('Direcciones pendientes de verificar');
  if (form.insurance_gps_address_match === 'No coincide') alerts.push('GPS no coincide con direcciones declaradas');
  if (insuranceCancelled || insuranceInvalidated) alerts.push(`Poliza ${String(form.insurance_status).toLowerCase()} ${daysText(insuranceCancelledDays)}`);
  if (gpsMissing) alerts.push('GPS por configurar');
  if (gpsOutsideFlorida) alerts.push('Vehiculo fuera de Florida');
  if (gpsLocationUnconfirmed) alerts.push('Ubicacion GPS por confirmar');
  if (gpsMileageExceeded) alerts.push('Exceso de millas GPS');
  if (gpsProblem && !gpsMissing && !gpsOutsideFlorida && !gpsLocationUnconfirmed && !gpsMileageExceeded) {
    alerts.push(gpsOverdue ? `GPS sin revisar ${daysText(gpsDaysSince)}` : 'GPS requiere accion');
  }
  if (gapProblem) alerts.push(gapVinMismatch ? 'VIN GAP no coincide' : 'GAP requiere verificacion');
  if (gapOpen) alerts.push(`GAP / siniestro activo ${daysText(gapClaimDays)}`);
  if (insuranceClaimOpen) alerts.push(`Reclamo seguro ${daysText(insuranceClaimDays)}`);
  if (insuranceClaimOpen && !form.claim_pending_action && !form.gap_missing_documents) alerts.push('Reclamo sin pendiente definido');
  if (recoveryOpen) alerts.push(repoConfirmed ? 'Repo confirmado en dealer' : 'Repo / entrega registrado');
  if (recoveryOpen && !form.recovery_last_location) alerts.push('Repo/entrega sin ubicacion');
  if (recoveryOpen && !form.recovery_policy_active_on_event) alerts.push('Repo/entrega sin poliza del evento');
  if (noFollowUp) alerts.push(`Sin seguimiento operador ${daysText(daysSinceOps)}`);
  if (noteProblem) alerts.push('Falta nota auditable');
  if (repoConfirmed) {
    alerts.length = 0;
    alerts.push('Repo confirmado en dealer; revision rutinaria cerrada');
  }
  const critical = !repoConfirmed && (insuranceCancelled
    || insuranceExpired
    || (form.insurance_customer_role === 'Conductor agregado' && form.insurance_driver_listed !== 'Si')
    || form.insurance_address_review_status === 'Inconsistencia critica'
    || form.gps_device_status === 'Desconectado'
    || gpsOutsideFlorida
    || (recoveryOpen && (!form.recovery_last_location || !form.recovery_policy_active_on_event))
    || (gapClaimDays !== null && gapClaimDays >= 7)
    || (insuranceClaimDays !== null && insuranceClaimDays >= 7));
  const severity = repoConfirmed ? 'closed' : critical ? 'critical' : alerts.length ? 'attention' : 'ok';
  return {
    sale, form, operations, activities, latest, policyProblem, gpsProblem, gpsMissing,
    gpsOutsideFlorida, gpsLocationUnconfirmed, gpsMileageExceeded, gapProblem, gapOpen,
    insuranceClaimOpen, insuranceCancelled, insuranceInvalidated, insuranceExpired, insuranceRepossession, repoConfirmed,
    insuranceCancelledDays, siniestroOpen, gapClaimOpen, recoveryOpen, noFollowUp, noteProblem, overdue, alerts,
    insuranceDaysSince, gpsDaysSince, gapClaimDays, insuranceClaimDays, daysSinceOps, saleAgeDays,
    dueToday, unscheduledIssue, critical, severity,
    partyClassificationPending,
    driverUnconfirmed: form.insurance_customer_role === 'Conductor agregado' && form.insurance_driver_listed !== 'Si',
    addressProblem: ['Pendiente de verificar', 'Inconsistencia critica'].includes(form.insurance_address_review_status)
      || form.insurance_gps_address_match === 'No coincide'
  };
}

function primaryOpsAction(profile) {
  const form = profile.form;
  if (profile.repoConfirmed) return 'Proceso cerrado: vehiculo confirmado en el dealer';
  if (form.gps_device_status === 'Desconectado') return 'SOS: localizar el vehiculo y verificar el GPS hoy';
  if (profile.insuranceCancelled || profile.insuranceExpired) return 'Contactar al cliente y resolver la poliza hoy';
  if (profile.gpsOutsideFlorida) return 'Confirmar ubicacion y escalar salida de Florida';
  if (profile.recoveryOpen && !form.recovery_last_location) return 'Verificar GPS y registrar ubicacion del vehiculo';
  if (profile.recoveryOpen && !form.recovery_policy_active_on_event) return 'Confirmar si la poliza estaba activa en la fecha del evento';
  if (profile.insuranceClaimOpen && (profile.insuranceClaimDays === null || profile.insuranceClaimDays >= 7)) return 'Llamar al seguro y actualizar el reclamo';
  if (profile.gapOpen && (profile.gapClaimDays === null || profile.gapClaimDays >= 7)) return 'Dar seguimiento al reclamo GAP y documentos pendientes';
  if (!form.insurance_policy_number) return 'Registrar y verificar la poliza del cliente';
  if (profile.partyClassificationPending) return 'Clasificar al cliente como titular o conductor de la poliza';
  if (profile.driverUnconfirmed) return 'Confirmar al cliente como conductor autorizado y documentar el seguimiento';
  if (profile.addressProblem) return 'Comprobar direcciones declaradas y contrastar la evidencia GPS';
  if (form.insurance_status === 'Activo pending') return 'Completar la verificacion de la poliza';
  if (profile.policyProblem) return 'Corregir la irregularidad de seguro y dejar nota';
  if (profile.gpsMissing) return 'Registrar IMEI y proveedor del GPS';
  if (profile.gpsProblem) return 'Verificar GPS, ubicacion, conexion y millas';
  if (profile.noFollowUp) return 'Registrar actividad y resultado del operador';
  return 'Sin accion pendiente';
}

function nextOpsDueText(profile) {
  if (profile.repoConfirmed) return 'Revision rutinaria cerrada';
  const dates = [
    profile.form.insurance_next_review_date,
    profile.form.gps_next_review_date
  ].filter(Boolean).sort();
  if (!dates.length) return profile.unscheduledIssue ? 'Sin proxima fecha: requiere programacion' : 'Sin fecha pendiente';
  const next = dates[0];
  const days = daysBetween(next);
  if (days > 0) return `Vencida hace ${days} dia${days === 1 ? '' : 's'}: ${formatDateDisplay(next)}`;
  if (days === 0) return `Vence hoy: ${formatDateDisplay(next)}`;
  return `Proxima fecha: ${formatDateDisplay(next)}`;
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
  if (opsFilter === 'insurance_pending') return profile.form.insurance_status === 'Activo pending';
  if (opsFilter === 'insurance_missing') return !profile.form.insurance_policy_number;
  if (opsFilter === 'insurance_cancelled') return profile.insuranceCancelled;
  if (opsFilter === 'insurance_expired') return profile.insuranceExpired;
  if (opsFilter === 'insurance_classification') return profile.partyClassificationPending;
  if (opsFilter === 'insurance_driver') return profile.driverUnconfirmed;
  if (opsFilter === 'insurance_address') return profile.addressProblem;
  if (opsFilter === 'gps') return profile.gpsProblem;
  if (opsFilter === 'gps_sos') return profile.form.gps_device_status === 'Desconectado';
  if (opsFilter === 'gps_inactive') return profile.form.gps_device_status === 'Inactivo';
  if (opsFilter === 'outside_florida') return profile.gpsOutsideFlorida;
  if (opsFilter === 'gps_missing') return profile.gpsMissing;
  if (opsFilter === 'mileage') return profile.gpsMileageExceeded;
  if (opsFilter === 'claims') return profile.siniestroOpen;
  if (opsFilter === 'claims_gap') return profile.siniestroOpen || profile.gapClaimOpen || profile.recoveryOpen;
  if (opsFilter === 'gap_claim') return profile.gapClaimOpen;
  if (opsFilter === 'recovery') return profile.recoveryOpen;
  if (opsFilter === 'overdue') return profile.overdue;
  if (opsFilter === 'operator') return profile.noFollowUp || profile.noteProblem;
  if (opsFilter === 'agenda') return profile.dueToday;
  return true;
}

const opsFilterGroups = {
  insurance: [
    ['Todo seguro', 'insurance'],
    ['Cancelado', 'insurance_cancelled'],
    ['Vencido', 'insurance_expired'],
    ['Activo pendiente', 'insurance_pending'],
    ['Sin poliza', 'insurance_missing'],
    ['Clasificacion pendiente', 'insurance_classification'],
    ['Conductor no confirmado', 'insurance_driver'],
    ['Direcciones', 'insurance_address']
  ],
  gps: [
    ['Todo GPS', 'gps'],
    ['SOS desconectado', 'gps_sos'],
    ['Inactivo', 'gps_inactive'],
    ['Sin configurar', 'gps_missing'],
    ['Fuera de Florida', 'outside_florida'],
    ['Exceso de millas', 'mileage']
  ],
  claims_gap: [
    ['Todos los procesos', 'claims_gap'],
    ['Siniestros', 'claims'],
    ['GAP', 'gap_claim'],
    ['Reposicion / entrega', 'recovery']
  ]
};

const opsFilterTitles = {
  all: 'Todos los expedientes',
  agenda: 'Acciones que requieren atencion hoy',
  insurance: 'Seguros que requieren atencion',
  insurance_cancelled: 'Polizas canceladas',
  insurance_expired: 'Polizas vencidas',
  insurance_pending: 'Polizas activas pendientes de completar',
  insurance_missing: 'Clientes sin poliza registrada',
  insurance_classification: 'Polizas pendientes de clasificar por titular o conductor',
  insurance_driver: 'Clientes no confirmados como conductores',
  insurance_address: 'Direcciones que requieren comprobacion',
  gps: 'GPS que requieren atencion',
  gps_sos: 'GPS desconectados: accion inmediata',
  gps_inactive: 'GPS inactivos',
  gps_missing: 'Vehiculos sin GPS configurado',
  outside_florida: 'Vehiculos fuera de Florida',
  mileage: 'Vehiculos con exceso de millas',
  claims_gap: 'Siniestros, GAP y recuperaciones',
  claims: 'Siniestros abiertos',
  gap_claim: 'Reclamos GAP abiertos',
  recovery: 'Reposiciones y entregas voluntarias',
  operator: 'Auditoria del operador'
};

function activeOpsGroup() {
  return Object.entries(opsFilterGroups).find(([, filters]) => filters.some(([, filter]) => filter === opsFilter))?.[0] || '';
}

function renderOpsSubfilters() {
  if (!controls.opsSubfilters) return;
  controls.opsSubfilters.replaceChildren();
  const group = activeOpsGroup();
  (opsFilterGroups[group] || []).forEach(([label, filter]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `secondary${opsFilter === filter ? ' active' : ''}`;
    button.dataset.opsFilter = filter;
    button.textContent = label;
    controls.opsSubfilters.append(button);
  });
  controls.opsSubfilters.hidden = !group;
}

function renderOpsMetric(label, value, filter = '', detail = '') {
  const box = document.createElement(filter ? 'button' : 'div');
  if (filter) box.type = 'button';
  box.className = 'ops-metric';
  if (filter) {
    box.dataset.opsFilter = filter;
    box.classList.toggle('active', opsFilter === filter || activeOpsGroup() === filter);
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
  const eventType = String(operation?.event_type || '');
  return Boolean(operation)
    && !eventType.startsWith('proxima_revision_')
    && !/^Identificacion \/ actualizacion GPS y seguro$/i.test(eventType);
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
      byOperator.set(key, { name, total: 0, today: 0, week: 0, completed: 0, pending: 0, missingNotes: 0, latest: null });
    }
    const summary = byOperator.get(key);
    const createdAt = new Date(operation.created_at || 0);
    summary.total += 1;
    if (createdAt >= today) summary.today += 1;
    if (createdAt >= sevenDays) summary.week += 1;
    if (['Completado', 'No aplica'].includes(operation.status)) summary.completed += 1;
    else summary.pending += 1;
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
      totalText.textContent = `Completadas: ${summary.completed}`;
      const latestText = document.createElement('span');
      const latestDate = summary.latest?.created_at ? new Date(summary.latest.created_at).toLocaleString('en-US') : 'sin fecha';
      latestText.textContent = `Pendientes: ${summary.pending}${summary.missingNotes ? ` | Sin nota: ${summary.missingNotes}` : ''} | Ultima: ${latestDate}`;
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
  const scrollTarget = profile.gpsProblem && !profile.policyProblem
    ? 'gpsSection'
    : profile.policyProblem
      ? 'insuranceSection'
      : 'operationsSection';
  loadSale(profile.sale.id, { module: 'INSURANCE_GPS', scrollTarget })
    .then(() => setCloudStatus('Expediente abierto directamente en GPS Y SEGURO. Registra la revision para dejar fecha, hora y usuario.', 'good'))
    .catch(error => setCloudStatus(error.message, 'error'));
}

function operationCategory(operation) {
  const text = `${operation?.event_type || ''} ${operation?.payload?.ops_action_type || ''}`.toLowerCase();
  const gps = /\bgps\b|geolocal|ubicacion|millas/.test(text);
  const insurance = /seguro|poliza|asegur|coverage|collision|comprehensive/.test(text);
  if (gps && insurance) return 'shared';
  if (gps) return 'gps';
  if (insurance) return 'insurance';
  return 'other';
}

function appendTimeline(container, operations, emptyText) {
  if (!container) return;
  container.replaceChildren();
  if (!operations.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-history';
    empty.textContent = emptyText;
    container.append(empty);
    return;
  }
  operations.forEach(operation => {
    const entry = document.createElement('div');
    entry.className = 'ops-history-entry';
    const title = document.createElement('strong');
    const exactDate = operation.created_at ? new Date(operation.created_at).toLocaleString('en-US') : 'Sin fecha';
    title.textContent = `${exactDate} | ${operation.event_type || 'Seguimiento'}`;
    const detail = document.createElement('span');
    const operator = operation.operator_name || (operation.created_by ? `Usuario ${String(operation.created_by).slice(0, 8)}` : 'Sin operador');
    const nextAction = operation.payload?.ops_next_action || operation.follow_up_at
      ? ` | Proxima accion: ${operation.payload?.ops_next_action || 'Seguimiento'}${operation.follow_up_at ? ` (${formatDateDisplay(operation.follow_up_at)})` : ''}`
      : '';
    detail.textContent = `Operador: ${operator} | Resultado: ${operation.status || 'Registrado'}${nextAction} | Nota: ${operation.note || 'Sin nota'}`;
    entry.append(title, detail);
    container.append(entry);
  });
}

async function loadCaseFile(saleId) {
  const [
    { data: sale, error: saleError },
    { data: operations, error: operationsError },
    { data: activities, error: activitiesError },
    { data: activityEvents, error: activityEventsError }
  ] = await Promise.all([
    supabase
      .from('doc_sales')
      .select('id, customer_name, customer_email, customer_phone, vehicle_description, vin, stock_number, contract_number, transaction_date, status, form_data, created_at, updated_at')
      .eq('id', saleId)
      .single(),
    supabase
      .from('doc_sale_operations')
      .select('id, sale_id, module, event_type, status, follow_up_at, note, payload, created_by, created_at')
      .eq('sale_id', saleId)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('doc_activities')
      .select('id, sale_id, module, activity_type, title, status, priority, due_at, note, assigned_to, created_by, completed_by, completed_at, created_at, updated_at')
      .eq('sale_id', saleId)
      .order('due_at', { ascending: true })
      .limit(500),
    supabase
      .from('doc_activity_events')
      .select('id, activity_id, sale_id, event_type, previous_status, new_status, previous_due_at, new_due_at, note, actor_id, created_at')
      .eq('sale_id', saleId)
      .order('created_at', { ascending: false })
      .limit(500)
  ]);
  if (saleError) throw saleError;
  if (operationsError) throw operationsError;
  if (activitiesError && activitiesError.code !== '42P01') throw activitiesError;
  if (activityEventsError && activityEventsError.code !== '42P01') throw activityEventsError;
  const operatorIds = [...new Set([
    ...(operations || []).map(operation => operation.created_by),
    ...(activityEvents || []).map(event => event.actor_id)
  ].filter(Boolean))];
  const operatorNames = new Map();
  if (operatorIds.length) {
    const { data: profiles } = await supabase.from('doc_user_profiles').select('id, full_name').in('id', operatorIds);
    (profiles || []).forEach(profile => operatorNames.set(profile.id, profile.full_name || 'Usuario sin nombre'));
  }
  (operations || []).forEach(operation => {
    operation.operator_name = operatorNames.get(operation.created_by) || `Usuario ${String(operation.created_by || '').slice(0, 8)}`;
  });
  const profile = buildOpsProfile(sale, (operations || []).filter(operation => operation.module === 'insurance_gps'), activities || []);
  profile.allOperations = operations || [];
  const activityById = new Map((activities || []).map(activity => [activity.id, activity]));
  profile.activityAudit = (activityEvents || []).map(event => {
    const activity = activityById.get(event.activity_id);
    const label = {
      created: 'Tarea creada',
      completed: 'Tarea completada',
      reopened: 'Tarea reabierta',
      rescheduled: 'Tarea reprogramada',
      cancelled: 'Tarea cancelada',
      updated: 'Tarea actualizada'
    }[event.event_type] || 'Cambio de tarea';
    const dueChange = event.previous_due_at && event.new_due_at && event.previous_due_at !== event.new_due_at
      ? `Fecha anterior: ${new Date(event.previous_due_at).toLocaleString('en-US')} | Nueva fecha: ${new Date(event.new_due_at).toLocaleString('en-US')}`
      : event.new_due_at
        ? `Fecha programada: ${new Date(event.new_due_at).toLocaleString('en-US')}`
        : '';
    return {
      event_type: `${label}: ${activity?.title || 'Actividad del expediente'}`,
      created_at: event.created_at,
      status: event.new_status || 'Registrado',
      note: [dueChange, event.note].filter(Boolean).join(' | ') || 'Cambio registrado automaticamente.',
      operator_name: operatorNames.get(event.actor_id) || (event.actor_id ? `Usuario ${String(event.actor_id).slice(0, 8)}` : 'Sistema')
    };
  });
  return profile;
}

function showCaseFileById(saleId) {
  setCloudStatus('Abriendo ficha completa del cliente y vehiculo...', '');
  loadCaseFile(saleId)
    .then(profile => {
      showOpsHistory(profile);
      setCloudStatus('Ficha completa abierta. La consulta no modifica el expediente.', 'good');
    })
    .catch(error => setCloudStatus(`No se pudo abrir la ficha: ${error.message}`, 'error'));
}

async function loadCustomerSales(customerId) {
  const [{ data: customer, error: customerError }, { data: sales, error: salesError }] = await Promise.all([
    supabase.from('doc_customers').select('id, full_name, email, phone').eq('id', customerId).maybeSingle(),
    supabase
      .from('doc_sales')
      .select('id, customer_name, customer_email, customer_phone, vehicle_description, vin, stock_number, contract_number, transaction_date, status, form_data, created_at')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
  ]);
  if (customerError) throw customerError;
  if (salesError) throw salesError;
  return { customer, sales: sales || [] };
}

function renderCustomerCaseSales(sales) {
  if (!controls.customerCaseSales) return;
  controls.customerCaseSales.replaceChildren();
  sales.forEach(sale => {
    const row = document.createElement('div');
    row.className = 'archive-row';
    const summary = document.createElement('div');
    summary.className = 'archive-summary';

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

    const actions = document.createElement('div');
    actions.className = 'archive-docs';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'secondary';
    open.textContent = 'Ver ficha de esta venta';
    open.addEventListener('click', () => {
      controls.customerCaseDialog.close();
      showCaseFileById(sale.id);
    });
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'secondary';
    edit.textContent = 'Editar venta';
    edit.addEventListener('click', () => {
      controls.customerCaseDialog.close();
      loadSale(sale.id, { scrollTarget: 'clientSection' }).catch(error => setCloudStatus(error.message, 'error'));
    });
    actions.append(open, edit);

    summary.append(vehicle, status, actions);
    row.append(summary);
    controls.customerCaseSales.append(row);
  });
}

async function showCustomerCaseFile(customerId, fallbackSaleId) {
  if (!customerId) {
    if (fallbackSaleId) showCaseFileById(fallbackSaleId);
    return;
  }
  setCloudStatus('Abriendo ficha del cliente...', '');
  try {
    const { customer, sales } = await loadCustomerSales(customerId);
    if (sales.length <= 1) {
      const only = sales[0];
      if (only) return showCaseFileById(only.id);
      if (fallbackSaleId) return showCaseFileById(fallbackSaleId);
      setCloudStatus('No se encontraron ventas para este cliente.', 'error');
      return;
    }
    if (!controls.customerCaseDialog) return;
    controls.customerCaseTitle.textContent = customer?.full_name || sales[0]?.customer_name || 'Cliente sin nombre';
    controls.customerCaseMeta.textContent = [customer?.email, customer?.phone].filter(Boolean).join(' | ') || 'Sin contacto registrado';
    renderCustomerCaseSales(sales);
    controls.customerCaseDialog.showModal();
    setCloudStatus(`Ficha del cliente abierta. ${sales.length} ventas encontradas.`, 'good');
  } catch (error) {
    setCloudStatus(`No se pudo abrir la ficha del cliente: ${error.message}`, 'error');
  }
}

function showOpsHistory(profile) {
  if (!controls.opsHistoryDialog) return;
  currentHistoryProfile = profile;
  controls.opsHistoryTitle.textContent = profile.sale.customer_name || 'Cliente sin nombre';
  controls.opsHistoryMeta.textContent = [
    profile.sale.vehicle_description || 'Vehiculo sin completar',
    profile.sale.vin ? `VIN ${profile.sale.vin}` : '',
    profile.sale.stock_number ? `Stock ${profile.sale.stock_number}` : ''
  ].filter(Boolean).join(' | ');
  const paymentTerms = [
    profile.form.pickup_down_total ? `Inicial ${profile.form.pickup_down_total}` : 'Inicial sin registrar',
    profile.form.pickup_down_paid_today ? `Pagado hoy ${profile.form.pickup_down_paid_today}` : '',
    profile.form.pickup_finance_amount ? `Financiado ${profile.form.pickup_finance_amount}` : '',
    profile.form.pickup_payment_count ? `${profile.form.pickup_payment_count} cuotas ${profile.form.pickup_frequency || ''}` : '',
    profile.form.pickup_start_date ? `Primera ${formatDateDisplay(profile.form.pickup_start_date)}` : ''
  ].filter(Boolean).join(' | ');
  const severityLabel = profile.severity === 'critical' ? 'CRITICO' : profile.severity === 'attention' ? 'PENDIENTE' : profile.severity === 'closed' ? 'CERRADO' : 'AL DIA';
  controls.opsHistoryStatus.className = `ops-case-status ${profile.severity || ''}`.trim();
  controls.opsHistoryAction.textContent = primaryOpsAction(profile);
  controls.opsHistoryDue.textContent = `Proxima fecha: ${nextOpsDueText(profile)}`;
  controls.opsHistorySeverity.textContent = severityLabel;
  const latestInterview = latestInterviewCall(profile.allOperations || []);
  const clientFacts = [
    ['Cliente', `Nacimiento: ${profile.form.customer_birth_date ? formatDateDisplay(profile.form.customer_birth_date) : 'pendiente'} | Telefono: ${profile.sale.customer_phone || 'sin telefono'}`],
    ['Venta', `${saleTypeLabel(profile.form)} | ${profile.sale.transaction_date ? formatDateDisplay(profile.sale.transaction_date) : 'sin fecha'} | Contrato ${profile.sale.contract_number || 'sin numero'}`],
    ['Contacto', `${profile.sale.customer_email || 'sin email'} | ${profile.sale.customer_phone || 'sin telefono'}`],
    ['Condiciones de pago', paymentTerms],
    ['Entrevista / referencias', latestInterview
      ? `${latestInterview.status || 'Registrado'} | ${new Date(latestInterview.created_at).toLocaleString('en-US')}`
      : 'Sin llamada de confirmacion registrada']
  ];
  const latestMechanical = latestMechanicalReview(profile.allOperations || []);
  const vehicleFacts = [
    ['Vehiculo', profile.sale.vehicle_description || 'sin completar'],
    ['VIN', profile.sale.vin || 'sin registrar'],
    ['Stock', profile.sale.stock_number || 'sin registrar'],
    ['Carga del expediente', profile.sale.created_at ? new Date(profile.sale.created_at).toLocaleString('en-US') : 'sin fecha'],
    ['Ultima revision mecanica', latestMechanical
      ? `${latestMechanical.status || 'Registrado'} | ${new Date(latestMechanical.created_at).toLocaleString('en-US')}`
      : 'Sin revision registrada']
  ];
  const insuranceFacts = [
    ['Seguro', `${profile.form.insurance_status || 'sin verificar'} | Poliza ${profile.form.insurance_policy_number || 'sin numero'} | Vence ${profile.form.insurance_expiration_date ? formatDateDisplay(profile.form.insurance_expiration_date) : 'sin fecha'}`],
    ['Partes de la poliza', `${profile.form.insurance_customer_role || 'rol pendiente'} | Titular: ${profile.form.insurance_policyholder_name || 'sin registrar'} | Conductor confirmado: ${profile.form.insurance_driver_listed || 'no confirmado'}`],
    ['Direcciones', `${profile.form.insurance_address_review_status || 'sin revisar'} | Contraste GPS: ${profile.form.insurance_gps_address_match || 'no confirmado'}`],
    ['Cobertura', `Comprehensive + Collision: ${profile.form.insurance_comprehensive === 'Si' && profile.form.insurance_collision === 'Si' ? 'Si' : 'No confirmado'} | EasyCar lien holder: ${profile.form.insurance_lienholder || 'no confirmado'}`]
  ];
  const gpsFacts = [
    ['GPS', `${profile.form.gps_device_status || 'sin verificar'} | IMEI ${profile.form.gps_imei || 'sin registrar'} | Proveedor ${profile.form.gps_provider || 'sin registrar'}`],
    ['Ubicacion y millas', `${profile.form.gps_last_location || 'sin ubicacion'} | ${profile.form.gps_location_jurisdiction || 'jurisdiccion pendiente'} | ${profile.form.gps_monthly_miles || 'sin millas'} en el periodo`],
    ['Siniestro / GAP', `${profile.form.gap_claim_status || 'sin reclamo'} | Seguro ${profile.form.insurance_claim_number || 'sin claim'} | GAP ${profile.form.gap_claim_number || 'sin claim'}`],
    ['Reposicion / entrega', `${profile.form.recovery_event_type || 'ninguno'} | Fecha ${profile.form.recovery_event_date ? formatDateDisplay(profile.form.recovery_event_date) : 'sin fecha'} | Ubicacion ${profile.form.recovery_last_location || 'sin confirmar'} | Poliza activa: ${profile.form.recovery_policy_active_on_event || 'sin confirmar'}`]
  ];
  const renderFacts = (container, facts) => container.replaceChildren(...facts.map(([label, value]) => {
    const fact = document.createElement('div');
    fact.className = 'ops-history-fact';
    const title = document.createElement('strong');
    title.textContent = label;
    const detail = document.createElement('span');
    detail.textContent = value;
    fact.append(title, detail);
    return fact;
  }));
  renderFacts(controls.opsHistoryClientFacts, clientFacts);
  renderFacts(controls.opsHistoryVehicleFacts, vehicleFacts);
  renderFacts(controls.opsHistoryInsuranceFacts, insuranceFacts);
  renderFacts(controls.opsHistoryGpsFacts, gpsFacts);
  const allOperations = profile.allOperations || profile.operations || [];
  const pendingTasks = calendarTasksForProfiles([profile]);
  if (controls.opsHistoryPending) {
    controls.opsHistoryPending.replaceChildren();
    if (!pendingTasks.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-history';
      empty.textContent = 'No hay una proxima gestion programada. Si el caso sigue activo, el operador debe fijar fecha y accion.';
      controls.opsHistoryPending.append(empty);
    } else {
      pendingTasks.forEach(task => {
        const entry = document.createElement('div');
        entry.className = 'ops-history-entry';
        const title = document.createElement('strong');
        title.textContent = `${formatDateDisplay(task.key)} ${task.time || '09:00'} | ${task.label}`;
        const detail = document.createElement('span');
        detail.textContent = task.note || 'Actividad pendiente programada en el expediente.';
        entry.append(title, detail);
        if (task.activity) {
          const actions = document.createElement('div');
          actions.className = 'archive-docs';
          const calendar = document.createElement('button');
          calendar.type = 'button';
          calendar.className = 'secondary';
          calendar.textContent = 'Google Calendar';
          calendar.addEventListener('click', () => {
            const url = googleCalendarTaskUrl(task);
            if (url) window.open(url, '_blank', 'noopener,noreferrer');
          });
          const reschedule = document.createElement('button');
          reschedule.type = 'button';
          reschedule.className = 'secondary';
          reschedule.textContent = 'Reprogramar';
          reschedule.addEventListener('click', () => rescheduleActivity(task.activity).catch(error => setCloudStatus(error.message, 'error')));
          actions.append(calendar, reschedule);
          if (!['insurance_review', 'gps_review'].includes(task.activity.activity_type)) {
            const complete = document.createElement('button');
            complete.type = 'button';
            complete.textContent = 'Completar seguimiento';
            complete.addEventListener('click', () => completeActivity(task.activity).catch(error => setCloudStatus(error.message, 'error')));
            actions.append(complete);
          }
          entry.append(actions);
        }
        controls.opsHistoryPending.append(entry);
      });
    }
  }
  appendTimeline(controls.opsHistoryInsurance, allOperations.filter(operation => ['insurance', 'shared'].includes(operationCategory(operation))), 'Todavia no hay verificaciones de seguro registradas.');
  appendTimeline(controls.opsHistoryGps, allOperations.filter(operation => ['gps', 'shared'].includes(operationCategory(operation))), 'Todavia no hay verificaciones de GPS registradas.');
  appendTimeline(controls.opsHistoryActivityAudit, profile.activityAudit || [], 'Todavia no hay cambios de agenda registrados.');
  appendTimeline(controls.opsHistoryOther, allOperations.filter(operation => operationCategory(operation) === 'other'), 'No hay otras actividades registradas.');
  if (!controls.opsHistoryDialog.open) controls.opsHistoryDialog.showModal();
}

function localDateKey(value) {
  if (!value) return '';
  const date = value instanceof Date
    ? new Date(value.getFullYear(), value.getMonth(), value.getDate())
    : new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function googleCalendarTaskUrl(task) {
  const [year, month, day] = String(task.key || '').split('-').map(Number);
  if (!year || !month || !day) return '';
  const time = String(task.time || '09:00');
  const [hour = 9, minute = 0] = time.split(':').map(Number);
  const start = new Date(year, month - 1, day, hour, minute, 0);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const compact = date => `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}00`;
  const profile = task.profile;
  const caseId = String(profile.sale.id || '').slice(0, 8).toUpperCase();
  const details = [
    `Caso DOC EASYCAR: ${caseId}`,
    `Accion: ${task.label}`,
    'La informacion personal y operativa permanece dentro de DOC EASYCAR.',
    'Abrir: https://docs.easycarus.com'
  ].filter(Boolean).join('\n');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `DOC EASYCAR - ${task.label} - Caso ${caseId}`,
    dates: `${compact(start)}/${compact(end)}`,
    ctz: 'America/New_York',
    details
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function calendarTasksForProfiles(profiles) {
  const tasks = [];
  const seen = new Set();
  profiles.forEach(profile => {
    if (profile.repoConfirmed) return;
    const add = (date, label, priority = '', time = '09:00', note = '', activity = null) => {
      const key = localDateKey(date);
      if (!key) return;
      const identity = `${profile.sale.id}|${key}|${String(label || '').trim().toLowerCase()}`;
      if (seen.has(identity)) return;
      seen.add(identity);
      tasks.push({ key, label, priority, profile, time, note, activity });
    };
    const hasActivityLedger = (profile.activities || []).length > 0;
    const pendingActivities = (profile.activities || []).filter(activity => activity.status === 'pending');
    if (pendingActivities.length) {
      pendingActivities.forEach(activity => {
        const due = new Date(activity.due_at);
        const time = Number.isNaN(due.getTime())
          ? '09:00'
          : `${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}`;
        add(due, activity.title, ['high', 'critical'].includes(activity.priority) ? 'alert' : '', time, activity.note || '', activity);
      });
      return;
    }
    if (hasActivityLedger) return;
    add(profile.form.insurance_next_review_date, 'Verificar poliza', profile.policyProblem ? 'alert' : '');
    add(profile.form.gps_next_review_date, 'Verificar GPS', profile.gpsProblem ? 'alert' : '');
    profile.operations
      .filter(operation => operation.follow_up_at && isOperatorAction(operation))
      .forEach(operation => add(
        operation.follow_up_at,
        operation.payload?.ops_next_action || operation.event_type || 'Seguimiento',
        operation.status === 'Irregularidad' ? 'alert' : '',
        operation.payload?.ops_next_action_time || '09:00',
        operation.note || ''
      ));
  });
  return tasks.sort((a, b) => a.key.localeCompare(b.key) || a.label.localeCompare(b.label));
}

async function refreshCurrentCaseFile() {
  if (!currentHistoryProfile?.sale?.id || !controls.opsHistoryDialog?.open) return;
  const profile = await loadCaseFile(currentHistoryProfile.sale.id);
  showOpsHistory(profile);
}

async function completeActivity(activity) {
  if (!activity?.id || !session?.user) return;
  const completionNote = window.prompt('Nota obligatoria: explica que gestion se completo y cual fue el resultado.');
  if (!completionNote) return;
  if (completionNote.trim().length < 12) throw new Error('La nota de cierre debe tener al menos 12 caracteres.');
  const { error } = await supabase
    .from('doc_activities')
    .update({
      status: 'completed',
      completed_by: session.user.id,
      completed_at: new Date().toISOString(),
      note: `${activity.note ? `${activity.note}\n` : ''}Resultado de cierre: ${completionNote.trim()}`
    })
    .eq('id', activity.id);
  if (error) throw error;
  await Promise.all([loadOpsReport(), refreshCurrentCaseFile()]);
  setCloudStatus(`Actividad completada: ${activity.title}. Quedo registrada con fecha, hora y usuario.`, 'good');
}

async function rescheduleActivity(activity) {
  if (!activity?.id || !session?.user) return;
  const current = new Date(activity.due_at);
  const currentDate = Number.isNaN(current.getTime()) ? '' : localDateKey(current);
  const date = window.prompt('Nueva fecha (YYYY-MM-DD)', currentDate);
  if (!date) return;
  const time = window.prompt('Nueva hora (HH:MM)', Number.isNaN(current.getTime()) ? '09:00' : `${String(current.getHours()).padStart(2, '0')}:${String(current.getMinutes()).padStart(2, '0')}`);
  if (!time) return;
  const reason = window.prompt('Motivo obligatorio de la reprogramacion');
  if (!reason) return;
  if (reason.trim().length < 12) throw new Error('El motivo de reprogramacion debe tener al menos 12 caracteres.');
  const due = new Date(`${date}T${time}:00`);
  if (Number.isNaN(due.getTime())) throw new Error('La nueva fecha u hora no es valida.');
  const { error } = await supabase
    .from('doc_activities')
    .update({
      status: 'pending',
      due_at: due.toISOString(),
      completed_by: null,
      completed_at: null,
      note: `${activity.note ? `${activity.note}\n` : ''}Motivo de reprogramacion: ${reason.trim()}`
    })
    .eq('id', activity.id);
  if (error) throw error;
  await Promise.all([loadOpsReport(), refreshCurrentCaseFile()]);
  setCloudStatus(`Actividad reprogramada para ${date} ${time}. El cambio quedo auditado.`, 'good');
}

function renderOpsCalendar(profiles) {
  if (!controls.opsCalendarGrid || !controls.opsCalendarAgenda || !controls.opsCalendarTitle) return;
  const tasks = calendarTasksForProfiles(profiles);
  const year = opsCalendarMonth.getFullYear();
  const month = opsCalendarMonth.getMonth();
  controls.opsCalendarTitle.textContent = `Agenda del operador - ${opsCalendarMonth.toLocaleString('es-US', { month: 'long', year: 'numeric' })}`;
  controls.opsCalendarGrid.replaceChildren();
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const todayKey = localDateKey(new Date());
  for (let offset = 0; offset < 42; offset += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + offset);
    const key = localDateKey(date);
    const dayTasks = tasks.filter(task => task.key === key);
    const cell = document.createElement('div');
    cell.className = `ops-calendar-day${date.getMonth() !== month ? ' muted' : ''}${key === todayKey ? ' today' : ''}${dayTasks.some(task => task.priority === 'alert') ? ' alert' : ''}`;
    const day = document.createElement('strong');
    day.textContent = String(date.getDate());
    cell.append(day);
    if (dayTasks.length) {
      const taskText = document.createElement('small');
      taskText.textContent = `${dayTasks.length} tarea${dayTasks.length === 1 ? '' : 's'}`;
      cell.append(taskText);
    }
    controls.opsCalendarGrid.append(cell);
  }
  controls.opsCalendarAgenda.replaceChildren();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const visible = tasks.filter(task => task.key.startsWith(monthPrefix));
  if (!visible.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-history';
    empty.textContent = 'No hay tareas programadas para este mes.';
    controls.opsCalendarAgenda.append(empty);
    return;
  }
  visible.forEach(task => {
    const row = document.createElement('div');
    row.className = 'ops-calendar-task';
    const date = document.createElement('strong');
    date.textContent = formatDateDisplay(task.key);
    const detail = document.createElement('span');
    detail.textContent = `${task.label}: ${task.profile.sale.customer_name || 'Cliente'}${task.profile.sale.vin ? ` | ${task.profile.sale.vin}` : ''}`;
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'secondary';
    open.textContent = 'Actualizar control';
    open.addEventListener('click', () => openOpsSale(task.profile));
    const google = document.createElement('button');
    google.type = 'button';
    google.className = 'secondary';
    google.textContent = 'Google Calendar';
    google.addEventListener('click', () => {
      const url = googleCalendarTaskUrl(task);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    });
    row.append(date, detail, open, google);
    if (task.activity) {
      const reschedule = document.createElement('button');
      reschedule.type = 'button';
      reschedule.className = 'secondary';
      reschedule.textContent = 'Reprogramar';
      reschedule.addEventListener('click', () => rescheduleActivity(task.activity).catch(error => setCloudStatus(error.message, 'error')));
      row.append(reschedule);
      if (!['insurance_review', 'gps_review'].includes(task.activity.activity_type)) {
        const complete = document.createElement('button');
        complete.type = 'button';
        complete.textContent = 'Completar seguimiento';
        complete.addEventListener('click', () => completeActivity(task.activity).catch(error => setCloudStatus(error.message, 'error')));
        row.append(complete);
      }
    }
    controls.opsCalendarAgenda.append(row);
  });
}

function renderOpsReport(profiles) {
  const operations = profiles.flatMap(profile => profile.operations || []);
  const operatorActions = operations.filter(isOperatorAction);
  const today = startOfLocalDay();
  controls.opsSummary.replaceChildren(
    renderOpsMetric('Expedientes', profiles.length, 'all', 'Clientes y vehiculos'),
    renderOpsMetric('Accion hoy', profiles.filter(profile => profile.dueToday).length, 'agenda', 'Trabajo pendiente o vencido'),
    renderOpsMetric('Seguro', profiles.filter(profile => profile.policyProblem).length, 'insurance', 'Casos que requieren atencion'),
    renderOpsMetric('GPS', profiles.filter(profile => profile.gpsProblem).length, 'gps', 'Casos que requieren atencion'),
    renderOpsMetric('Siniestros / GAP', profiles.filter(profile => profile.siniestroOpen || profile.gapClaimOpen || profile.recoveryOpen).length, 'claims_gap', 'Reclamos y recuperaciones'),
    renderOpsMetric('Auditoria', profiles.filter(profile => profile.noFollowUp || profile.noteProblem).length, 'operator', `${operatorActions.filter(operation => new Date(operation.created_at || 0) >= today).length} acciones hoy`)
  );
  const criticalCount = profiles.filter(profile => profile.critical).length;
  const unscheduledCount = profiles.filter(profile => profile.unscheduledIssue).length;
  const withoutActivityCount = profiles.filter(profile => !profile.latest && !profile.repoConfirmed).length;
  if (controls.opsHealthStrip) {
    controls.opsHealthStrip.classList.toggle('critical', criticalCount > 0);
    const summary = document.createElement('span');
    summary.textContent = criticalCount
      ? `${criticalCount} caso${criticalCount === 1 ? '' : 's'} critico${criticalCount === 1 ? '' : 's'} | ${unscheduledCount} sin proxima fecha | ${withoutActivityCount} sin actividad del operador`
      : `Sin casos criticos | ${unscheduledCount} sin proxima fecha | ${withoutActivityCount} sin actividad del operador`;
    const updated = document.createElement('small');
    updated.textContent = opsLoadedAt ? `Actualizado ${opsLoadedAt.toLocaleString('en-US')}` : 'Cargando informacion';
    controls.opsHealthStrip.replaceChildren(summary, updated);
  }
  renderOpsSubfilters();
  renderOperatorSummary(operations);
  renderOpsCalendar(profiles);
  if (controls.opsCalendarPanel) controls.opsCalendarPanel.hidden = opsFilter !== 'agenda';
  if (controls.opsOperatorPanel) controls.opsOperatorPanel.hidden = opsFilter !== 'operator';

  controls.opsResults.replaceChildren();
  const visibleProfiles = profiles.filter(opsVisible).sort((a, b) => {
    const score = profile => (profile.overdue ? 40 : 0)
      + (profile.policyProblem ? 15 : 0)
      + (profile.gpsProblem ? 15 : 0)
      + (profile.gpsOutsideFlorida ? 20 : 0)
      + (profile.gpsMileageExceeded ? 10 : 0)
      + (profile.gapOpen ? 10 : 0)
      + (profile.noFollowUp ? 8 : 0)
      + (profile.noteProblem ? 5 : 0);
    return score(b) - score(a);
  });
  if (controls.opsResultsTitle) controls.opsResultsTitle.textContent = opsFilterTitles[opsFilter] || 'Expedientes';
  if (controls.opsResultsCount) controls.opsResultsCount.textContent = `${visibleProfiles.length} caso${visibleProfiles.length === 1 ? '' : 's'}`;
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
    const statusLine = document.createElement('div');
    statusLine.className = 'ops-status-line';
    const addChip = (text, tone) => {
      const chip = document.createElement('span');
      chip.className = `ops-chip ${tone}`;
      chip.textContent = text;
      statusLine.append(chip);
    };
    addChip(profile.severity === 'critical' ? 'CRITICO' : profile.severity === 'attention' ? 'PENDIENTE' : profile.severity === 'closed' ? 'CERRADO' : 'AL DIA', profile.severity === 'critical' ? 'alert' : profile.severity === 'attention' ? 'warn' : 'ok');
    addChip(`Seguro: ${profile.form.insurance_status || 'Sin verificar'}`, profile.policyProblem ? 'alert' : 'ok');
    addChip(`GPS: ${profile.form.gps_device_status || 'Sin verificar'}`, profile.gpsProblem ? 'alert' : 'ok');
    if (profile.siniestroOpen) addChip('Siniestro', 'warn');
    if (profile.gapClaimOpen) addChip('GAP abierto', 'warn');
    if (profile.recoveryOpen) addChip('Reposicion / entrega', 'warn');
    const nextAction = document.createElement('div');
    nextAction.className = 'ops-next-action';
    nextAction.textContent = primaryOpsAction(profile);
    const due = document.createElement('div');
    due.className = 'ops-due';
    due.textContent = nextOpsDueText(profile);
    const audit = document.createElement('div');
    audit.className = 'archive-meta';
    audit.textContent = profile.latest
      ? `Ultima accion: ${daysText(profile.daysSinceOps)}${profile.latest.operator_name ? ` por ${profile.latest.operator_name}` : ''}`
      : 'Sin actividad registrada';
    status.append(statusLine, nextAction, due, audit);

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
    history.className = '';
    history.textContent = 'Ver ficha';
    history.addEventListener('click', () => showCaseFileById(profile.sale.id));
    actions.append(open, history, message);

    row.append(identity, vehicle, status, actions);
    controls.opsResults.append(row);
  });
}

function exportOpsReport() {
  const visibleProfiles = opsProfilesCache.filter(opsVisible);
  const headers = [
    'Prioridad', 'Cliente', 'Telefono', 'Email', 'Vehiculo', 'VIN', 'Stock',
    'Estatus seguro', 'Numero poliza', 'Vencimiento poliza', 'Proxima revision seguro',
    'Rol cliente poliza', 'Titular poliza', 'Cliente conductor confirmado', 'Resultado direcciones', 'Contraste GPS direcciones',
    'Estatus GPS', 'IMEI', 'Proveedor GPS', 'Ultima transmision GPS', 'Ubicacion transmitida', 'Proxima revision GPS',
    'Evento', 'Estatus GAP', 'Proxima accion', 'Fecha pendiente', 'Ultimo operador', 'Ultima actividad', 'Ultima nota'
  ];
  const rows = [headers, ...visibleProfiles.map(profile => [
    profile.severity === 'critical' ? 'CRITICO' : profile.severity === 'attention' ? 'PENDIENTE' : profile.severity === 'closed' ? 'CERRADO' : 'AL DIA',
    profile.sale.customer_name,
    profile.sale.customer_phone,
    profile.sale.customer_email,
    profile.sale.vehicle_description,
    profile.sale.vin,
    profile.sale.stock_number,
    profile.form.insurance_status,
    profile.form.insurance_policy_number,
    profile.form.insurance_expiration_date,
    profile.form.insurance_next_review_date,
    profile.form.insurance_customer_role,
    profile.form.insurance_policyholder_name,
    profile.form.insurance_driver_listed,
    profile.form.insurance_address_review_status,
    profile.form.insurance_gps_address_match,
    profile.form.gps_device_status,
    profile.form.gps_imei,
    profile.form.gps_provider,
    profile.form.gps_last_seen_at,
    profile.form.gps_last_location,
    profile.form.gps_next_review_date,
    profile.form.recovery_event_type,
    profile.form.gap_claim_status,
    primaryOpsAction(profile),
    nextOpsDueText(profile),
    profile.latest?.operator_name,
    profile.latest?.created_at,
    profile.latest?.note
  ])];
  const stamp = new Date().toISOString().slice(0, 10);
  const filterName = String(opsFilter || 'todos').replace(/[^a-z0-9_-]+/gi, '_');
  downloadCsv(`DOC_EASYCAR_reporte_${filterName}_${stamp}.csv`, rows);
  setCloudStatus(`Reporte descargado: ${visibleProfiles.length} caso${visibleProfiles.length === 1 ? '' : 's'}.`, 'good');
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
        opsProfilesCache = sales.map(sale => buildOpsProfile(sale, []));
        opsLoadedAt = new Date();
        renderOpsReport(opsProfilesCache);
        return;
      }
      setCloudStatus(`No se pudo cargar historial GPS / Seguro: ${error.message}`, 'error');
      return;
    }
    operations.push(...(data || []));
    if ((data || []).length < pageSize) break;
  }

  const activities = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('doc_activities')
      .select('id, sale_id, module, activity_type, title, status, priority, due_at, note, assigned_to, created_by, completed_by, completed_at, created_at, updated_at')
      .order('due_at', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) {
      if (error.code === '42P01') break;
      setCloudStatus(`No se pudo cargar la agenda operativa: ${error.message}`, 'error');
      return;
    }
    activities.push(...(data || []));
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
  const activitiesBySale = new Map();
  activities.forEach(activity => {
    if (!activitiesBySale.has(activity.sale_id)) activitiesBySale.set(activity.sale_id, []);
    activitiesBySale.get(activity.sale_id).push(activity);
  });
  opsProfilesCache = sales.map(sale => buildOpsProfile(sale, bySale.get(sale.id) || [], activitiesBySale.get(sale.id) || []));
  opsLoadedAt = new Date();
  renderOpsReport(opsProfilesCache);
}

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` };
}

async function connectGoogleCalendar() {
  if (!session?.access_token) throw new Error('Debes entrar con un usuario autorizado.');
  controls.connectGoogleCalendar.disabled = true;
  if (controls.calendarConnectionStatus) {
    controls.calendarConnectionStatus.textContent = 'Preparando suscripcion privada de solo lectura...';
    controls.calendarConnectionStatus.className = 'status';
  }
  try {
    const response = await fetch('/api/calendar/connect', { method: 'POST', headers: authHeaders() });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se pudo preparar el calendario.');
    let copied = false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(result.feedUrl);
        copied = true;
      } catch (error) {
        console.warn('El navegador no permitio copiar el enlace de calendario.', error);
      }
    }
    if (!copied) window.prompt('Copia este enlace privado y pegalo en Google Calendar > Desde URL', result.feedUrl);
    if (controls.calendarConnectionStatus) {
      controls.calendarConnectionStatus.textContent = copied
        ? 'Enlace privado copiado. Pegalo en Google Calendar > Desde URL. Es una suscripcion de solo lectura y no debe compartirse.'
        : 'Google Calendar se abrio. Pega alli el enlace privado mostrado. Es una suscripcion de solo lectura; no debes compartirla.';
      controls.calendarConnectionStatus.className = 'status good';
    }
    window.open(result.calendarSettingsUrl, '_blank', 'noopener,noreferrer');
  } finally {
    controls.connectGoogleCalendar.disabled = false;
  }
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

function renderAdminUnavailable(message) {
  controls.adminUsers.replaceChildren();
  const note = document.createElement('p');
  note.className = 'status error';
  note.textContent = message;
  controls.adminUsers.append(note);
}

async function loadCurrentProfileRole() {
  if (!supabase || !session?.user) return '';
  const { data, error } = await supabase
    .from('doc_user_profiles')
    .select('role, active')
    .eq('id', session.user.id)
    .maybeSingle();
  if (error) throw error;
  currentProfileRole = data?.active ? data.role || '' : '';
  return currentProfileRole;
}

async function loadAdminUsers() {
  if (!session?.access_token) return;
  const response = await fetch('/api/admin/users', { headers: authHeaders() });
  if (response.status === 403) {
    if (currentProfileRole !== 'admin') controls.adminPanel.hidden = true;
    else {
      controls.adminPanel.hidden = false;
      renderAdminUnavailable('Tu acceso maestro esta activo. Falta completar la configuracion privada del servidor para administrar usuarios desde esta pantalla.');
    }
    return;
  }
  const result = await response.json();
  if (!response.ok) {
    if (currentProfileRole === 'admin') {
      controls.adminPanel.hidden = false;
      renderAdminUnavailable('Tu acceso maestro esta activo. La administracion de usuarios requiere una configuracion privada del servidor pendiente.');
      return;
    }
    throw new Error(result.error || 'No se pudo cargar usuarios');
  }
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
    controls.importStatus.textContent = `Carga completada y auditada: ${result.inserted} expedientes creados, ${result.warnings || 0} advertencias de datos pendientes y ${result.historicalVinWarnings || 0} VIN historicos permitidos con stock diferente. Lote ${String(result.batchId || '').slice(0, 8)}.`;
    controls.importStatus.className = 'status good';
    setCloudStatus('Carga masiva completada. Los clientes ya aparecen en archivo central y GPS Y SEGURO.', 'good');
    controls.importFile.value = '';
    await loadImportBatches();
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
    const smsText = result.smsTo ? ` DocuSeal acepto el telefono ${result.smsTo} para SMS.` : '';
    const text = document.createTextNode(`Solicitud de firma creada para ${result.sentTo}.${smsText} Confirma la recepcion con el cliente antes de asumir entrega. `);
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
    setCloudStatus('Solicitud creada en DocuSeal y expediente guardado. La entrega real por SMS debe confirmarse por evento del proveedor o con el cliente.', 'good');
    if (session?.user) {
      await loadRecentSales();
      await loadArchive();
      await loadOpsReport();
    }
  } finally {
    controls.sendSignature.disabled = false;
  }
}

async function sendInsuranceSms() {
  if (!session?.access_token) throw new Error('Debes entrar con un usuario autorizado.');
  if (!currentSaleId) throw new Error('Guarda o abre primero el expediente central.');
  const response = await fetch('/api/messages/insurance-sms', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ saleId: currentSaleId })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'No se pudo procesar el SMS.');
  await loadSaleOperationHistory(currentSaleId);
  await loadOpsReport();
  setCloudStatus(result.message || 'SMS procesado.', result.delivery === 'sent' ? 'good' : '');
}

const PHYSICAL_SIGNATURE_MAX_BYTES = 25 * 1024 * 1024;
const PHYSICAL_SIGNATURE_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

async function markSignedPhysicalAndNotify(file) {
  if (!supabase || !session?.user) throw new Error('Debes entrar con un usuario autorizado.');
  if (!currentSaleId) throw new Error('Guarda o abre primero el expediente central.');
  if (!file) throw new Error('Selecciona el documento firmado (PDF, JPG o PNG).');
  if (!PHYSICAL_SIGNATURE_MIME_TYPES.includes(file.type)) throw new Error('El archivo debe ser PDF, JPG o PNG.');
  if (file.size > PHYSICAL_SIGNATURE_MAX_BYTES) throw new Error('El archivo no puede superar 25 MB.');

  const saleId = currentSaleId;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-') || 'documento-firmado';
  const storagePath = `${saleId}/physical/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from('easycar-documents')
    .upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;

  const { error: documentError } = await supabase.from('doc_sale_documents').insert({
    sale_id: saleId,
    document_type: 'signed_physical',
    storage_path: storagePath,
    original_name: file.name,
    mime_type: file.type,
    size_bytes: file.size,
    uploaded_by: session.user.id
  });
  if (documentError) throw documentError;

  const { error: saleError } = await supabase
    .from('doc_sales')
    .update({ status: 'signed_physical', signature_method: 'physical' })
    .eq('id', saleId);
  if (saleError) throw saleError;

  const { error: operationError } = await supabase.from('doc_sale_operations').insert({
    sale_id: saleId,
    module: 'bhph',
    event_type: 'Venta firmada fisicamente',
    status: 'Completado',
    note: `Documento firmado subido: ${file.name}`,
    payload: { storage_path: storagePath },
    created_by: session.user.id
  });
  if (operationError) throw operationError;

  const response = await fetch('/api/signature/notify-physical', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ saleId, storagePath })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'No se pudo enviar la notificacion por correo.');

  setCurrentSale(saleId, 'signed_physical');
  await loadSaleOperationHistory(saleId);
  await loadArchive();
  return result;
}

async function sendLoginLink() {
  const email = controls.sellerEmail.value.trim() || DEFAULT_SELLER_EMAIL;
  const password = controls.sellerPassword.value;
  controls.sellerEmail.value = email;
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

function clearCurrentSale() {
  setCurrentSale(null);
}

window.EasyCarCloud = {
  saveSale,
  saveInsuranceGpsIdentification,
  saveInsuranceGpsReview,
  insuranceGpsDraftPending,
  saveMechanicalReview,
  saveInterviewCall,
  checkDuplicateVin,
  scheduleAutoSave,
  openSale: loadSale,
  clearCurrentSale
};

controls.opsHistoryEditSale?.addEventListener('click', () => {
  const profile = currentHistoryProfile;
  if (!profile) return;
  controls.opsHistoryDialog?.close();
  loadSale(profile.sale.id, { scrollTarget: 'clientSection' })
    .catch(error => setCloudStatus(error.message, 'error'));
});

controls.opsHistoryEditControl?.addEventListener('click', () => {
  const profile = currentHistoryProfile;
  if (!profile) return;
  controls.opsHistoryDialog?.close();
  openOpsSale(profile);
});

if (!configured) {
  document.body.dataset.auth = 'signed-in';
  controls.auth.style.display = 'none';
  setCloudStatus('Supabase no esta configurado en Vercel. Puedes llenar e imprimir, pero no guardar ni enviar firma digital.');
} else {
  controls.sendLogin.addEventListener('click', sendLoginLink);
  controls.sellerEmail.value = controls.sellerEmail.value.trim() || DEFAULT_SELLER_EMAIL;
  controls.sellerPassword.focus();
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
  controls.sendInsuranceSms?.addEventListener('click', () => sendInsuranceSms().catch(error => setCloudStatus(error.message, 'error')));
  controls.markSignedPhysical?.addEventListener('click', () => controls.markSignedPhysicalFile?.click());
  controls.markSignedPhysicalFile?.addEventListener('change', () => {
    const file = controls.markSignedPhysicalFile.files?.[0];
    controls.markSignedPhysicalFile.value = '';
    if (!file) return;
    setCloudStatus('Subiendo documento firmado y enviando notificacion...', '');
    markSignedPhysicalAndNotify(file)
      .then(result => setCloudStatus(`Venta marcada como firmada fisicamente. Notificacion enviada a ${result.sentTo}.`, 'good'))
      .catch(error => setCloudStatus(`No se pudo completar la firma fisica: ${error.message}`, 'error'));
  });
  const setOpsFilterFromEvent = event => {
    const button = event.target.closest('[data-ops-filter]');
    if (!button) return;
    opsFilter = button.dataset.opsFilter || 'all';
    renderOpsReport(opsProfilesCache);
  };
  controls.opsSummary.addEventListener('click', setOpsFilterFromEvent);
  controls.opsSubfilters?.addEventListener('click', setOpsFilterFromEvent);
  controls.opsRefreshReport?.addEventListener('click', () => loadOpsReport().catch(error => setCloudStatus(error.message, 'error')));
  controls.opsExportReport?.addEventListener('click', exportOpsReport);
  controls.opsCalendarPrevious?.addEventListener('click', () => {
    opsCalendarMonth = new Date(opsCalendarMonth.getFullYear(), opsCalendarMonth.getMonth() - 1, 1);
    renderOpsReport(opsProfilesCache);
  });
  controls.opsCalendarNext?.addEventListener('click', () => {
    opsCalendarMonth = new Date(opsCalendarMonth.getFullYear(), opsCalendarMonth.getMonth() + 1, 1);
    renderOpsReport(opsProfilesCache);
  });
  controls.connectGoogleCalendar?.addEventListener('click', () => connectGoogleCalendar().catch(error => {
    if (controls.calendarConnectionStatus) {
      controls.calendarConnectionStatus.textContent = error.message;
      controls.calendarConnectionStatus.className = 'status warn';
    }
  }));
  controls.opsSearch.addEventListener('input', () => renderOpsReport(opsProfilesCache));
  controls.clearOpsSearch.addEventListener('click', () => {
    controls.opsSearch.value = '';
    renderOpsReport(opsProfilesCache);
  });

  const { data } = await supabase.auth.getSession();
  setSessionUi(data.session);
  supabase.auth.onAuthStateChange((event, nextSession) => {
    setSessionUi(nextSession);
    if (event === 'PASSWORD_RECOVERY') showPasswordRecovery();
  });
}
