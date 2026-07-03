import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appHtml = readFileSync(path.join(rootDir, 'index.html'), 'utf8');

function parseOriginalDocs() {
  const match = appHtml.match(/const ORIGINAL_DOCS = (\[[\s\S]*?\]);\s*const pickupDocument/);
  if (!match) throw new Error('Unable to load EasyCar document package');
  return JSON.parse(match[1]);
}

function logoSrc() {
  const match = appHtml.match(/<img src="([^"]+)" alt="EasyCar">/);
  return match ? match[1] : '';
}

const ORIGINAL_DOCS = parseOriginalDocs();
const LOGO_SRC = logoSrc();
const INTEGRATION_NOTICE = 'PART OF SIGNED CONTRACT / PARTE INTEGRANTE DEL CONTRATO FIRMADO';
const DOC_TITLES = {
  gps: 'GPS Disclosure',
  fee: 'GPS Fee Notice',
  maintenance: 'Maintenance Package',
  use: 'Personal Vehicle Use',
  history: 'Vehicle History / CARFAX',
  card: 'Credit Card Authorization',
  pickup: 'Pick-Up Payment',
  conditional: 'Conditional Delivery',
  communication: 'Communication Authorization',
  creditapp: 'Credit Application'
};
const DOC_SETS = {
  BHPH: ORIGINAL_DOCS.map(doc => doc.key),
  BANCO: ['pickup', 'card']
};

const pickupDocument = ORIGINAL_DOCS.find(doc => doc.key === 'pickup');
const pickupSchedule = pickupDocument?.blocks.find(block => block.type === 'table' && block.rows?.[0]?.[0] === '#');
if (pickupSchedule && pickupSchedule.rows.length < 13) {
  for (let i = 11; i <= 12; i++) {
    pickupSchedule.rows.push([String(i), `{{pickup_date_${i}}}`, `{{pickup_amount_${i}_money}}`, `{{pickup_receipt_${i}}}`]);
  }
}

function esc(text) {
  return String(text || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
}

function raw(form, id) {
  return String(form?.[id] || '').trim();
}

function saleType(form) {
  return raw(form, 'sale_type') === 'BANCO' ? 'BANCO' : 'BHPH';
}

function selectedDocs(form) {
  const order = DOC_SETS[saleType(form)] || DOC_SETS.BHPH;
  return order.map(key => ORIGINAL_DOCS.find(doc => doc.key === key)).filter(Boolean);
}

function fullName(form) {
  return [raw(form, 'first_name'), raw(form, 'middle_name'), raw(form, 'last_name'), raw(form, 'second_last_name')].filter(Boolean).join(' ');
}

function cityStateZip(form) {
  return [raw(form, 'city'), raw(form, 'state'), raw(form, 'zip_code')].filter(Boolean).join(' ');
}

function formatMiles(form) {
  const miles = raw(form, 'vehicle_mileage').replace(/\D/g, '');
  return miles ? `${miles.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} miles` : '';
}

function vehicle(form) {
  return [[raw(form, 'vehicle_year'), raw(form, 'vehicle_make'), raw(form, 'vehicle_model')].filter(Boolean).join(' '), formatMiles(form)].filter(Boolean).join(' | ');
}

function vehicleYearMake(form) {
  return [raw(form, 'vehicle_year'), raw(form, 'vehicle_make'), raw(form, 'vehicle_model')].filter(Boolean).join(' ');
}

function vehicleModelYear(form) {
  return [raw(form, 'vehicle_model'), raw(form, 'vehicle_year')].filter(Boolean).join(' / ');
}

function moneyValue(form, id) {
  const value = raw(form, id);
  return value ? '$' + value.replace(/^\$/, '') : '';
}

function monthValue(form, id) {
  const value = raw(form, id);
  const match = value.match(/^(\d{4})-(\d{2})$/);
  return match ? `${match[2]}/${match[1].slice(-2)}` : value;
}

function parseDate(value) {
  const rawValue = String(value || '').trim();
  const match = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const parsed = new Date(rawValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
}

function transactionDate(form) {
  return formatDate(parseDate(raw(form, 'transaction_date'))) || formatDate(new Date());
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function conditionalDeadline(form) {
  const delivery = parseDate(raw(form, 'conditional_delivery_date')) || parseDate(raw(form, 'transaction_date')) || new Date();
  return formatDate(addDays(delivery, 10));
}

function last4(form) {
  return raw(form, 'card_last_four').replace(/\D/g, '').slice(-4);
}

function tokenValue(form, key) {
  if (key === 'pickup_down_total_money') return moneyValue(form, 'pickup_down_total');
  if (key === 'pickup_finance_money') return moneyValue(form, 'pickup_finance_amount');
  if (key === 'pickup_card_last_four') return last4(form);
  if (key === 'vehicle_model_year') return vehicleModelYear(form);
  if (key === 'vehicle_year_make') return vehicleYearMake(form);
  if (key === 'vehicle_mileage_display') return formatMiles(form);
  if (key === 'transaction_date_display') return transactionDate(form);
  if (key === 'conditional_delivery_date_display') return formatDate(parseDate(raw(form, 'conditional_delivery_date'))) || transactionDate(form);
  if (key === 'conditional_deadline_display') return raw(form, 'conditional_deadline') || conditionalDeadline(form);
  if (key === 'call_hours_en' || key === 'call_hours_es') {
    const chosen = raw(form, 'preferred_call_hours');
    return ['8am-12pm', '12pm-5pm', '5pm-9pm'].map(slot => `${chosen === slot ? '☑' : '☐'} ${slot}`).join('   ');
  }
  const amount = key.match(/^pickup_amount_(\d+)_money$/);
  if (amount) return moneyValue(form, `pickup_amount_${amount[1]}`);
  return raw(form, key);
}

function markChoices(form, text) {
  let out = text;
  const gps = raw(form, 'gps_status');
  out = out.replace('[  ] I ACCEPT', gps === 'Confirmado' ? '[X] I ACCEPT' : '[  ] I ACCEPT');
  out = out.replace('[  ] I DECLINE', gps === 'No confirmado' ? '[X] I DECLINE' : '[  ] I DECLINE');
  const freq = raw(form, 'pickup_frequency');
  out = out.replace('[   ] Weekly', freq === 'Weekly' ? '[X] Weekly' : '[   ] Weekly');
  out = out.replace('[   ] Bi-Weekly', freq === 'Bi-Weekly' ? '[X] Bi-Weekly' : '[   ] Bi-Weekly');
  out = out.replace('[   ] Monthly', freq === 'Monthly' ? '[X] Monthly' : '[   ] Monthly');
  const hist = raw(form, 'vehicle_history_decision');
  out = out.replace('[ ] Customer reviewed an available vehicle history report', hist === 'reviewed' ? '[X] Customer reviewed an available vehicle history report' : '[ ] Customer reviewed an available vehicle history report');
  out = out.replace('[ ] Customer voluntarily declined to review', hist === 'declined' ? '[X] Customer voluntarily declined to review' : '[ ] Customer voluntarily declined to review');
  out = out.replace('[ ] Customer understands that Customer may still request', hist === 'request' ? '[X] Customer understands that Customer may still request' : '[ ] Customer understands that Customer may still request');
  return out;
}

function fillText(form, text) {
  let out = String(text || '');
  const customerName = fullName(form);
  const sellerName = raw(form, 'sales_rep_name');
  const cardholderName = raw(form, 'cardholder_name') || customerName;
  const date = transactionDate(form);
  const dealerCell = /(EASYCAR LLC REP|EASYCAR LLC SIGNATURE|DEALER REPRESENTATIVE|POR EASYCAR LLC)/.test(out);

  out = markChoices(form, out);
  out = out.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key) => tokenValue(form, key));
  if (out.trim().startsWith('Stock Number:')) {
    out = `Stock Number: ${raw(form, 'stock_number')}   Contract No.: ${raw(form, 'contract_number')}   Date: ${date}`;
  }

  const fields = [
    ['Customer / Cliente:', () => customerName],
    ['Co-Buyer / Co-Comprador:', () => raw(form, 'co_buyer_name')],
    ['Address / Dirección:', () => raw(form, 'address')],
    ['City / State / ZIP:', () => cityStateZip(form)],
    ['Phone Number / Teléfono:', () => raw(form, 'phone')],
    ['Driver License / Licencia:', () => raw(form, 'driver_license')],
    ['Year, Make, Model / Año, Marca, Modelo:', () => vehicle(form)],
    ['Year, Make & Model / Vehículo:', () => vehicle(form)],
    ['Vehicle (Year, Make, Model) / Vehículo:', () => vehicle(form)],
    ['VIN:', () => raw(form, 'vin')],
    ['Mileage / Millas:', () => formatMiles(form)],
    ['Stock Number / Número de Inventario:', () => raw(form, 'stock_number')],
    ['Retail Installment Contract No.:', () => raw(form, 'contract_number')],
    ['Transaction Date / Fecha de la Transacción:', () => date],
    ['Transaction Date / Fecha:', () => date],
    ['Date / Fecha de la Transacción:', () => date],
    ['Price/Payment Terms / Condiciones Pago:', () => raw(form, 'price_payment_terms')],
    ['Bank Name / Nombre del Banco:', () => raw(form, 'bank_name')],
    ['Authorized Amount / Monto Autorizado a Debitar:', () => moneyValue(form, 'authorized_amount')],
    ['Name on Card / Nombre en la Tarjeta:', () => raw(form, 'cardholder_name')],
    ['Card Number / Número de Tarjeta (16 Digits):', () => '**** **** **** ' + last4(form)],
    ['Card Number / Número de Tarjeta:', () => '**** **** **** ' + last4(form)],
    ['Expiration Date / Fecha Vencimiento (MM/YY):', () => monthValue(form, 'card_expiration')],
    ['Billing ZIP Code / Código Postal de Facturación:', () => raw(form, 'billing_zip')]
  ];

  for (const [label, getter] of fields) {
    const value = getter();
    if (!value || !out.includes(label)) continue;
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escaped + '[ \\t]*\\n[_$ ./\\-]+', 'g'), `${label} ${value}`);
    out = out.replace(new RegExp(escaped + '[ \\t]*[_$./\\-][ \\t_$./\\-]*', 'g'), `${label} ${value}`);
  }

  out = out.replace(/Printed Name \/ Nombre Impreso:\s*_{3,}/g, `Printed Name / Nombre Impreso: ${dealerCell ? sellerName : customerName}`);
  out = out.replace(/Name\/Nombre:\s*_{5,}/g, `Name/Nombre: ${dealerCell ? sellerName : customerName}`);
  out = out.replace(/Name:\s*_{5,}/g, `Name: ${sellerName}`);
  out = out.replace(/Cardholder Signature\nFirma del Titular de la Tarjeta/g, `Cardholder Signature\nFirma del Titular de la Tarjeta\nName/Nombre: ${cardholderName}`);
  out = out.replace(/Borrower Signature \(If different\)\nFirma del Deudor \(Si es distinto\)/g, `Borrower Signature (If different)\nFirma del Deudor (Si es distinto)\nName/Nombre: ${customerName}`);
  if (out.trim() === 'BUYER SIGNATURE') out = `BUYER SIGNATURE\n${customerName}`;
  if (out.trim() === 'CUSTOMER SIGNATURE') out = `CUSTOMER SIGNATURE\n${customerName}`;
  if (out.trim() === 'EASYCAR LLC SIGNATURE') out = `EASYCAR LLC SIGNATURE\n${sellerName}`;
  if (out.trim() === 'EASYCAR LLC REP') out = `EASYCAR LLC REP\n${sellerName}`;
  out = out.replace(/Execution Date \/ Fecha\s*\n\s*______ \/ ______ \/ 20_____/g, `Execution Date / Fecha\n${date}`);
  out = out.replace(/Date\/Fecha:\s*____\/____\/______/g, `Date/Fecha: ${date}`);
  out = out.replace(/Date\/Fecha(?!:)/g, `Date/Fecha: ${date}`);
  out = out.replace(/Date \/ Fecha:\s*____\/____\/____/g, `Date / Fecha: ${date}`);
  out = out.replace(/Date \/ Fecha:\s*______ \/ ______ \/ 2026/g, `Date / Fecha: ${date}`);
  out = out.replace(/Date \/ Fecha(?!\s+de\b|:)/g, `Date / Fecha: ${date}`);
  out = out.replace(/Date:\s*____\/____\/______/g, `Date: ${date}`);
  if (out.trim() === 'Date') out = `Date: ${date}`;
  out = out.replace(/EASYCAR LLC REP:/g, `EASYCAR LLC REP: ${sellerName}`);
  out = out.replace(/\(10 PAYMENTS \/ PAGOS\)/g, `(${raw(form, 'pickup_payment_count') || 10} PAYMENTS / PAGOS)`);
  return out;
}

function isHeading(text) {
  const t = text.trim();
  if (t.length > 120) return false;
  return /^[A-Z0-9 /&().,;:'\-ÁÉÍÓÚÑÜ]+$/.test(t);
}

function renderParagraph(form, text, isFirst) {
  const filled = fillText(form, text);
  if (isFirst && filled.includes('\n')) {
    const [english, ...spanish] = filled.split('\n');
    return `<h2 class="bilingual-title"><span>${esc(english)}</span><span>${esc(spanish.join(' '))}</span></h2>`;
  }
  if (isFirst) return `<h2>${esc(filled)}</h2>`;
  if (isHeading(text)) return `<h3>${esc(filled)}</h3>`;
  return `<p>${esc(filled)}</p>`;
}

function tableClass(rows) {
  const joined = rows.flat().join(' ');
  if (rows[0]?.[0] === '#') return 'payment-schedule';
  if (joined.includes('Customer / Cliente:') || joined.includes('Bank Name / Nombre del Banco:') || joined.includes('Down Payment Total / Monto total del down:')) return 'info';
  if (joined.includes('[ ]') || joined.includes('[  ]')) return 'choice';
  return '';
}

function signatureField(name, required = true) {
  return `<signature-field name="${esc(name)}" role="Customer" required="${required ? 'true' : 'false'}" format="drawn_or_typed" style="width: 180px; height: 34px; display: inline-block;"></signature-field>`;
}

function signatureLabel(label) {
  const rawLabel = String(label || '').toUpperCase();
  if (/DEALER REPRESENTATIVE|POR EASYCAR/.test(rawLabel)) return 'DEALER REPRESENTATIVE / POR EASYCAR LLC';
  if (/EASYCAR LLC REP/.test(rawLabel)) return 'EASYCAR LLC REP';
  if (/EASYCAR LLC SIGNATURE/.test(rawLabel)) return 'EASYCAR LLC SIGNATURE';
  if (/CARDHOLDER/.test(rawLabel)) return 'CARDHOLDER SIGNATURE / FIRMA DEL TITULAR DE LA TARJETA';
  if (/BORROWER|DEUDOR/.test(rawLabel)) return 'BORROWER SIGNATURE / FIRMA DEL DEUDOR';
  if (/CO-BUYER|CO-COMPRADOR/.test(rawLabel)) return 'CO-BUYER / CO-COMPRADOR';
  if (/BUYER SIGNATURE/.test(rawLabel)) return 'BUYER SIGNATURE';
  if (/CUSTOMER SIGNATURE/.test(rawLabel)) return 'CUSTOMER SIGNATURE';
  if (/CUSTOMER|CLIENTE/.test(rawLabel)) return 'CUSTOMER / CLIENTE';
  return String(label || '').split('\n')[0].replace(/_{3,}/g, '').trim();
}

function renderSignatureTable(form, rows, doc) {
  const date = transactionDate(form);
  const customerName = fullName(form);
  const coBuyerName = raw(form, 'co_buyer_name');
  const sellerName = raw(form, 'sales_rep_name');
  const header = rows[0] || [];
  const cells = header.map((cell, index) => {
    const originalLabel = String(cell || '');
    const isDealer = /EASYCAR|DEALER|REP/i.test(originalLabel);
    const isCoBuyer = /CO-BUYER|CO-COMPRADOR/i.test(originalLabel);
    const isCustomer = /CUSTOMER|CLIENTE|BUYER|COMPRADOR|CARDHOLDER|BORROWER|DEUDOR/i.test(originalLabel);
    const label = esc(signatureLabel(originalLabel));
    const name = isDealer ? sellerName : isCoBuyer ? coBuyerName : customerName;
    const field = isCustomer || isCoBuyer ? `<div class="sign-field">${signatureField(`${DOC_TITLES[doc?.key] || 'Document'} ${index + 1} Signature`, !isCoBuyer || Boolean(coBuyerName))}</div>` : '<div class="manual-line">X ______________________________</div>';
    return `<td><strong>${label}</strong><div class="printed-name">Name/Nombre: ${esc(name)}</div>${field}<div class="printed-date">Date/Fecha: ${esc(date)}</div></td>`;
  }).join('');
  return `<table class="signature-table"><tbody><tr>${cells}</tr></tbody></table>`;
}

function renderTable(form, rows, doc, forceSignature = false) {
  const joined = rows.flat().join(' ');
  const compactEnough = joined.length < 1000 && rows.length <= 4;
  const signatureLike = forceSignature || (compactEnough && /(CUSTOMER|CLIENTE|BUYER|COMPRADOR|CARDHOLDER|BORROWER|DEUDOR|EASYCAR|DEALER|REP)/i.test(joined) && /(SIGNATURE|FIRMA|X _)/i.test(joined));
  if (signatureLike) return renderSignatureTable(form, rows, doc);

  const isPaymentSchedule = rows[0]?.[0] === '#';
  const paymentCount = Number(raw(form, 'pickup_payment_count')) || 10;
  const visibleRows = isPaymentSchedule ? rows.filter((row, index) => index === 0 || Number(row[0]) <= paymentCount) : rows;
  return `<table class="${tableClass(visibleRows)}"><tbody>${visibleRows.map(row => `<tr>${row.map(cell => `<td>${esc(fillText(form, cell))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function renderDoc(form, doc, index, total) {
  let firstParagraph = true;
  const parts = [];
  for (let blockIndex = 0; blockIndex < doc.blocks.length; blockIndex++) {
    const block = doc.blocks[blockIndex];
    if (block.type === 'table') {
      parts.push(renderTable(form, block.rows, doc));
      continue;
    }
    if (block.text.trim() === 'SIGNATURES / FIRMAS' && doc.blocks[blockIndex + 1]?.type === 'table') {
      parts.push(`<section class="signature-block">${renderParagraph(form, block.text, false)}${renderTable(form, doc.blocks[blockIndex + 1].rows, doc, true)}</section>`);
      blockIndex++;
      continue;
    }
    parts.push(renderParagraph(form, block.text, firstParagraph));
    firstParagraph = false;
  }
  return `<article class="doc doc-${esc(doc.key)} page-break"><p class="doc-label">Documento ${index + 1} de ${total} | ${esc(DOC_TITLES[doc.key] || doc.name)} | ${saleType(form)}</p><p class="integration-note">${esc(INTEGRATION_NOTICE)}</p>${parts.join('')}</article>`;
}

export function renderDocusealHtml(form) {
  const safeForm = form || {};
  const docsToRender = selectedDocs(safeForm);
  const docs = docsToRender.map((doc, index) => renderDoc(safeForm, doc, index, docsToRender.length)).join('');
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    body { margin: 54px 26px 30px; color: #182235; font-family: Arial, Helvetica, sans-serif; font-size: 7.85pt; line-height: 1.18; }
    .doc { padding: 0; margin: 0 0 9pt; }
    .page-break { page-break-after: auto; }
    .doc-label { margin: 0 0 5pt; color: #ed1c2e; font-size: 6.8pt; font-weight: 700; text-transform: uppercase; }
    .integration-note { margin: 0 0 5pt; color: #44536a; font-size: 6.4pt; font-weight: 700; text-align: center; }
    h2 { margin: 0 0 5pt; color: #12233d; font-size: 11.4pt; line-height: 1.12; text-align: center; }
    h3 { margin: 5pt 0 2.4pt; color: #1555a6; font-size: 8.2pt; line-height: 1.1; }
    p { margin: 2.8pt 0; white-space: pre-wrap; }
    table { width: 100%; border-collapse: collapse; margin: 3pt 0 4.5pt; table-layout: fixed; }
    td { border: .7pt solid #b8c2d1; padding: 2.8pt 3.4pt; vertical-align: top; white-space: pre-wrap; }
    tr:first-child td { background: #f2f5fa; color: #12233d; font-weight: 700; }
    table.info tr:first-child td { background: #fff; font-weight: 400; }
    table.choice td { font-weight: 700; }
    .bilingual-title { display: grid; grid-template-columns: 1fr 1fr; gap: 12pt; align-items: start; }
    .bilingual-title span + span { border-left: .7pt solid #d7deea; padding-left: 12pt; }
    .signature-block { page-break-inside: avoid; break-inside: avoid; margin-top: 4pt; }
    .signature-table { page-break-inside: avoid; break-inside: avoid; }
    .signature-table td { font-size: 7.05pt; min-height: 48px; }
    .printed-name, .printed-date { margin-top: 2.5pt; }
    .manual-line { margin-top: 5pt; }
    .sign-field { margin-top: 2.5pt; min-height: 35px; }
    .doc-creditapp td, .doc-communication td, .doc-conditional td { padding: 2.1pt 3pt; }
    .doc-creditapp h2, .doc-communication h2, .doc-conditional h2 { font-size: 10.8pt; margin-bottom: 3.5pt; }
    .doc-creditapp h3, .doc-communication h3, .doc-conditional h3 { margin-top: 4pt; }
  </style>
</head>
<body>${docs}</body>
</html>`;
}

export function renderDocusealHeader() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin: 0 34px; font-family: Arial, Helvetica, sans-serif; color: #12233d; overflow: hidden; }
    .head { width: 100%; border-bottom: 2px solid #ed1c2e; padding-bottom: 5px; display: table; }
    .logo { display: table-cell; width: 155px; vertical-align: middle; }
    .logo img { width: 145px; max-height: 40px; object-fit: contain; }
    .info { display: table-cell; text-align: right; font-size: 6px; line-height: 1.2; font-weight: 700; vertical-align: middle; white-space: nowrap; }
  </style></head><body><div class="head"><div class="logo"><img src="${LOGO_SRC}" alt="EasyCar"></div><div class="info">EASYCAR LLC<br>7581 NW 50th St, Miami, FL 33166<br>(786) 818-0018 | info@easycarfl.com</div></div></body></html>`;
}

export function renderDocusealFooter() {
  return '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0 28px;font-family:Arial,Helvetica,sans-serif;color:#637085;font-size:7px}.foot{border-top:1px solid #d7deea;padding-top:3px;text-align:right}</style></head><body><div class="foot">EasyCar Document Package | Page <span class="pageNumber"></span> of <span class="totalPages"></span></div></body></html>';
}
