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

function parseVoluntaryDocs() {
  const match = appHtml.match(/const VOLUNTARY_DOCS = (\[[\s\S]*?\]);\s*const pickupSchedule/);
  if (!match) throw new Error('Unable to load EasyCar voluntary package');
  return Function(`"use strict"; return (${match[1]});`)();
}

function logoSrc() {
  const match = appHtml.match(/<img src="([^"]+)" alt="EasyCar">/);
  return match ? match[1] : '';
}

const ORIGINAL_DOCS = parseOriginalDocs();
const VOLUNTARY_DOCS = parseVoluntaryDocs();
const ALL_DOCS = [...ORIGINAL_DOCS, ...VOLUNTARY_DOCS];
const LOGO_SRC = logoSrc();
const INTEGRATION_NOTICE = 'PART OF SIGNED CONTRACT / PARTE INTEGRANTE DEL CONTRATO FIRMADO';
const DOC_TITLES = {
  gps: 'GPS Disclosure',
  fee: 'GPS Fee Notice',
  maintenance: 'Maintenance Package',
  use: 'Personal Vehicle Use',
  history: 'Vehicle History / CARFAX',
  card: 'Credit Card Authorization',
  pickup: 'Initial Financing Agreement',
  conditional: 'Conditional Delivery',
  communication: 'Communication Authorization',
  creditapp: 'Credit Application',
  voluntary_notice: 'Voluntary Return Agreement',
  voluntary_condition: 'Vehicle Condition & Photos'
};
const DOC_SETS = {
  BHPH: ORIGINAL_DOCS.map(doc => doc.key),
  BANCO: ['pickup', 'card'],
  VOLUNTARY: ['voluntary_notice', 'voluntary_condition']
};

const pickupDocument = ORIGINAL_DOCS.find(doc => doc.key === 'pickup');
const pickupSchedule = pickupDocument?.blocks.find(block => block.type === 'table' && block.rows?.[0]?.[0] === '#');
if (pickupSchedule && pickupSchedule.rows.length < 15) {
  for (let i = pickupSchedule.rows.length; i <= 14; i++) {
    pickupSchedule.rows.push([String(i), `{{pickup_date_${i}}}`, `{{pickup_amount_${i}_money}}`, `{{pickup_interest_${i}_money}}`, `{{pickup_principal_${i}_money}}`, `{{pickup_balance_${i}_money}}`]);
  }
}
const pickupTerms = pickupDocument?.blocks.find((block, index, blocks) => block.type === 'table' && blocks[index - 1]?.text === '1. FINANCING TERMS / TERMINOS DEL FINANCIAMIENTO');
if (pickupTerms) {
  pickupTerms.rows = [
    ['Down Payment Total / Monto total del down: {{pickup_down_total_money}}', 'Paid Today at Delivery / Pagado hoy al entregar: {{pickup_down_paid_today_money}}'],
    ['Principal Amount Financed / Saldo a financiar: {{pickup_finance_money}}', 'Down Collected / Porcentaje cobrado: {{pickup_down_collected_percent}}'],
    ['Annual Interest Rate / Interes anual: {{pickup_interest_rate_percent}}', 'Finance Charge / Cargo financiero: {{pickup_finance_charge_money}}'],
    ['Total of Payments / Total de pagos: {{pickup_total_payments_money}}', 'Term / Plazo: {{pickup_payment_count}} payments / pagos'],
    ['Issue Date / Fecha de emision: {{transaction_date_display}}', 'First Payment Date / Primera fecha de pago: {{pickup_start_date_display}}'],
    ['Frequency / Frecuencia: [   ] Weekly / Semanal       [   ] Bi-Weekly / Bi-semanal       [   ] Monthly / Mensual', 'Card Surcharge / Cargo tarjeta: 1.8% when paid by debit or credit card / cuando se pague con tarjeta']
  ];
}
function applyPickupLoanClauses(doc) {
  if (!doc || doc.loanClausesApplied) return;
  const blocks = doc.blocks;
  const scheduleHeading = blocks.find(block => block.type === 'p' && block.text === '3. PAYMENT SCHEDULE / CALENDARIO DE PAGOS');
  const scheduleTable = blocks.find(block => block.type === 'table' && block.rows?.[0]?.[0] === '#');
  const signatureHeading = blocks.find(block => block.type === 'p' && block.text === 'SIGNATURES / FIRMAS');
  const signatureTable = blocks.find((block, index) => block.type === 'table' && blocks[index - 1]?.text === 'SIGNATURES / FIRMAS');
  const footer = blocks[blocks.length - 1];
  doc.blocks = [
    blocks[0], blocks[1], blocks[2], blocks[3], blocks[4], blocks[5],
    { type: 'p', text: '2. PURPOSE, SEPARATION FROM VEHICLE SALE, AND BORROWER REPRESENTATIONS / PROPOSITO, SEPARACION DE LA VENTA Y DECLARACIONES DEL DEUDOR' },
    { type: 'table', rows: [
      ['This Agreement finances the unpaid or deferred portion of the customer down payment connected to the vehicle transaction identified above. It is part of the signed vehicle sale and financing contract package, but it is not itself the vehicle purchase agreement. Borrower understands that any bank approval decision is separate and is not guaranteed by EASYCAR LLC.', 'Este Acuerdo financia la parte pendiente o diferida del pago inicial relacionada con la transaccion del vehiculo identificado arriba. Forma parte del paquete de contrato de venta y financiamiento firmado, pero no es por si mismo el contrato de compra del vehiculo. El Deudor entiende que cualquier aprobacion bancaria es separada y no esta garantizada por EASYCAR LLC.'],
      ['Borrower represents that Borrower is of legal age, has capacity to sign, inspected and accepted the vehicle, and is not relying on verbal promises or statements not contained in the written documents signed with EASYCAR LLC.', 'El Deudor declara que es mayor de edad, tiene capacidad para firmar, inspecciono y acepto el vehiculo, y no depende de promesas verbales o declaraciones que no esten contenidas en los documentos escritos firmados con EASYCAR LLC.'],
      ['Borrower certifies that all information provided to EASYCAR LLC is true and complete. False, incomplete, or misleading information may constitute default and may affect the vehicle transaction and this Agreement.', 'El Deudor certifica que toda la informacion entregada a EASYCAR LLC es verdadera y completa. Informacion falsa, incompleta o enganosa puede constituir incumplimiento y afectar la transaccion del vehiculo y este Acuerdo.']
    ] },
    { type: 'p', text: '3. PAYMENT TERMS AND FEES / TERMINOS DE PAGO Y CARGOS' },
    { type: 'table', rows: [
      ['For value received, Borrower promises to pay EASYCAR LLC the principal amount financed, finance charge, and any applicable fees according to the schedule below. Time is of the essence. Payments must be received on or before the due date and, when applicable, by 5:00 PM Eastern Time on a business day.', 'Por valor recibido, el Deudor promete pagar a EASYCAR LLC el monto principal financiado, cargo financiero y cargos aplicables conforme al calendario abajo. El tiempo es esencial. Los pagos deben recibirse en o antes de la fecha de vencimiento y, cuando aplique, antes de las 5:00 PM hora del Este en un dia habil.'],
      ['If a due date falls on a non-business day, payment is due on the next business day unless EASYCAR LLC agrees otherwise in writing. Payments must be made in lawful money of the United States.', 'Si una fecha de pago cae en un dia no habil, el pago vence el siguiente dia habil salvo acuerdo escrito distinto de EASYCAR LLC. Los pagos deben hacerse en moneda legal de los Estados Unidos.'],
      ['Card payments may include a 1.8% card processing surcharge. Borrower may avoid that surcharge by using an available non-card payment method accepted by EASYCAR LLC.', 'Los pagos con tarjeta pueden incluir un recargo de procesamiento de 1.8%. El Deudor puede evitar ese recargo usando un metodo de pago disponible que no sea tarjeta y que sea aceptado por EASYCAR LLC.'],
      ['A $10 manual processing fee may apply when payment requires manual handling. A $5 late fee may apply if a scheduled payment is not received within ten (10) days after its due date. Returned, rejected, reversed, or insufficient-funds payments may result in a $20 returned payment fee or the actual charge imposed by the financial institution, where permitted by law.', 'Puede aplicar un cargo de $10 por procesamiento manual cuando el pago requiere manejo manual. Puede aplicar un cargo de $5 por mora si un pago programado no se recibe dentro de diez (10) dias despues de su vencimiento. Pagos devueltos, rechazados, reversados o con fondos insuficientes pueden causar un cargo de $20 o el cargo real impuesto por la institucion financiera, donde sea permitido por la ley.'],
      ['Borrower may request up to two payment deferments before the original due date. Each approved deferment may extend the current payment date by seven (7) days, may carry a $20 fee, and cannot be used for the first or second scheduled payment.', 'El Deudor puede solicitar hasta dos diferimientos antes de la fecha original de vencimiento. Cada diferimiento aprobado puede extender la fecha actual de pago por siete (7) dias, puede tener un cargo de $20 y no puede usarse para el primer ni segundo pago programado.'],
      ['Borrower may prepay all or part of this Agreement at any time without prepayment penalty. Unless required by law, earned finance charges and fees already incurred are not automatically refundable.', 'El Deudor puede pagar todo o parte de este Acuerdo por adelantado en cualquier momento sin penalidad por prepago. Salvo que la ley exija lo contrario, los cargos financieros ganados y cargos ya causados no son automaticamente reembolsables.']
    ] },
    scheduleHeading,
    scheduleTable,
    { type: 'p', text: '4. DEFAULT, REMEDIES, AND COLLECTION / INCUMPLIMIENTO, REMEDIOS Y COBRO' },
    { type: 'table', rows: [
      ['Borrower may be in default if Borrower fails to pay as agreed, provides false or materially incomplete information, reverses or stops a payment without first contacting EASYCAR LLC, becomes insolvent, files or is subject to bankruptcy, unilaterally attempts to cancel this Agreement without lawful basis, fails to cooperate with the related vehicle transaction documents, or materially breaches any term of this Agreement.', 'El Deudor puede estar en incumplimiento si no paga segun lo acordado, provee informacion falsa o materialmente incompleta, reversa o detiene un pago sin contactar primero a EASYCAR LLC, se declara insolvente, inicia o queda sujeto a quiebra, intenta cancelar unilateralmente este Acuerdo sin base legal, no coopera con los documentos relacionados de la transaccion del vehiculo, o incumple materialmente cualquier termino de este Acuerdo.'],
      ['Borrower must notify EASYCAR LLC of any change of name, address, telephone number, or email. Failure to maintain current contact information may be treated as a breach because it affects servicing, payment reminders, notices, and collection activity.', 'El Deudor debe notificar a EASYCAR LLC cualquier cambio de nombre, direccion, telefono o correo electronico. No mantener informacion de contacto actualizada puede tratarse como incumplimiento porque afecta el servicio de cuenta, recordatorios de pago, avisos y gestiones de cobro.'],
      ['Upon default, and subject to applicable law, EASYCAR LLC may accelerate the unpaid balance, declare all amounts immediately due, apply payments already received to the account or earned charges, pursue collection, report or refer the account where legally permitted, and recover reasonable collection costs, court costs, and attorney fees where allowed by law.', 'En caso de incumplimiento, y sujeto a la ley aplicable, EASYCAR LLC puede acelerar el saldo pendiente, declarar todos los montos inmediatamente vencidos, aplicar pagos ya recibidos a la cuenta o cargos ganados, iniciar gestiones de cobro, reportar o referir la cuenta donde sea legalmente permitido, y recuperar costos razonables de cobro, costos judiciales y honorarios de abogado donde la ley lo permita.'],
      ['Customer agrees to contact EASYCAR LLC directly to resolve billing errors, payment questions, accounting concerns, or card disputes before initiating a chargeback or payment dispute.', 'El Cliente acepta contactar directamente a EASYCAR LLC para resolver errores de facturacion, preguntas de pago, inquietudes contables o disputas de tarjeta antes de iniciar un contracargo o disputa de pago.']
    ] },
    { type: 'p', text: '5. ADDITIONAL AGREEMENTS / ACUERDOS ADICIONALES' },
    { type: 'table', rows: [
      ['If more than one person signs this Agreement, each signer is jointly and severally responsible unless prohibited by law. A person signing for Borrower represents authority to bind Borrower and also agrees to be personally bound to the extent permitted by law.', 'Si mas de una persona firma este Acuerdo, cada firmante responde solidariamente salvo que la ley lo prohiba. Una persona que firme por el Deudor declara tener autoridad para obligarlo y tambien acepta quedar personalmente obligada en la medida permitida por la ley.'],
      ['Borrower authorizes EASYCAR LLC to contact Borrower by phone, SMS, email, WhatsApp, mail, or other electronic or analog means for account servicing, verification, payment reminders, collection, appointment reminders, and transaction updates.', 'El Deudor autoriza a EASYCAR LLC a contactarlo por telefono, SMS, correo electronico, WhatsApp, correo postal u otros medios electronicos o analogos para servicio de cuenta, verificacion, recordatorios de pago, cobro, recordatorios de citas y actualizaciones de la transaccion.'],
      ['This Agreement may not be assigned by Borrower without written consent. EASYCAR LLC may assign, transfer, service, or enforce this Agreement through its successors, assigns, agents, or service providers where legally permitted.', 'Este Acuerdo no puede ser cedido por el Deudor sin consentimiento escrito. EASYCAR LLC puede ceder, transferir, administrar o ejecutar este Acuerdo por medio de sus sucesores, cesionarios, agentes o proveedores de servicio donde sea legalmente permitido.'],
      ['No provision of this Agreement is intended to violate applicable law, including limits on interest, fees, disclosures, or consumer rights. If any term is unenforceable, the remaining terms remain enforceable to the fullest extent permitted by law.', 'Ninguna disposicion de este Acuerdo busca violar la ley aplicable, incluyendo limites sobre intereses, cargos, divulgaciones o derechos del consumidor. Si algun termino no es exigible, los demas terminos seguiran vigentes en la maxima medida permitida por la ley.']
    ] },
    { type: 'p', text: '6. GOVERNING LAW, NOTICES, REVISIONS, AND ENTIRE AGREEMENT / LEY APLICABLE, AVISOS, REVISIONES Y ACUERDO COMPLETO' },
    { type: 'table', rows: [
      ['This Agreement is governed by Florida law. Notices may be delivered personally, by email, mail, recognized carrier, or any other lawful method to the contact information provided by the parties.', 'Este Acuerdo se rige por la ley de Florida. Los avisos pueden entregarse personalmente, por correo electronico, correo postal, transportista reconocido o cualquier otro metodo legal a la informacion de contacto provista por las partes.'],
      ['Any revision, waiver, extension, or modification must be in writing and signed or confirmed by EASYCAR LLC. A waiver on one occasion is not a continuing waiver.', 'Cualquier revision, renuncia, extension o modificacion debe constar por escrito y estar firmada o confirmada por EASYCAR LLC. Una renuncia en una ocasion no constituye renuncia continua.'],
      ['Borrower had the opportunity to ask questions and to seek independent advice before signing. Borrower acknowledges receiving and reviewing the schedule, disclosures, and documents that form part of the vehicle sale and financing package.', 'El Deudor tuvo oportunidad de hacer preguntas y buscar asesoria independiente antes de firmar. El Deudor reconoce haber recibido y revisado el calendario, divulgaciones y documentos que forman parte del paquete de venta y financiamiento del vehiculo.'],
      ['This Agreement and the signed vehicle sale and financing package are the entire agreement regarding the deferred down payment obligation. Prior oral discussions or promises are not binding unless included in the written signed documents.', 'Este Acuerdo y el paquete firmado de venta y financiamiento del vehiculo constituyen el acuerdo completo respecto a la obligacion de pago inicial diferido. Conversaciones o promesas verbales previas no son vinculantes salvo que esten incluidas en los documentos escritos firmados.']
    ] },
    { type: 'p', text: '7. REQUIRED NOTICES AND LEGAL COMPLIANCE / AVISOS REQUERIDOS Y CUMPLIMIENTO LEGAL' },
    { type: 'table', rows: [
      ['Borrower should not sign this Agreement before reading it or if it contains blanks that should be completed. Borrower is entitled to receive a copy of this Agreement and the related payment schedule after signing.', 'El Deudor no debe firmar este Acuerdo antes de leerlo ni si contiene espacios en blanco que deban completarse. El Deudor tiene derecho a recibir una copia de este Acuerdo y del calendario de pagos relacionado despues de firmar.'],
      ['No interest, finance charge, fee, collection cost, or other amount is intended to exceed the maximum permitted by applicable law. If any amount is determined to exceed the lawful limit, it shall be reduced to the maximum lawful amount and any excess shall be credited or refunded as required by law.', 'Ningun interes, cargo financiero, cargo, costo de cobro u otro monto busca exceder el maximo permitido por la ley aplicable. Si algun monto excede el limite legal, sera reducido al maximo legal y cualquier exceso sera acreditado o reembolsado segun exija la ley.'],
      ['There is no automatic cancellation or cooling-off period unless required by applicable law or stated in a separate written disclosure signed or provided by EASYCAR LLC. If a written cancellation right applies, Borrower must follow that written notice exactly.', 'No existe cancelacion automatica ni periodo de arrepentimiento salvo que lo exija la ley aplicable o que conste en una divulgacion escrita separada firmada o provista por EASYCAR LLC. Si aplica un derecho escrito de cancelacion, el Deudor debe seguir exactamente ese aviso escrito.'],
      ['Any dispute-resolution or arbitration provision contained in a separately signed sale, finance, or arbitration document remains part of the transaction package and controls to the extent permitted by law.', 'Cualquier disposicion de resolucion de disputas o arbitraje contenida en un documento separado de venta, financiamiento o arbitraje firmado forma parte del paquete de la transaccion y prevalece en la medida permitida por la ley.']
    ] },
    { type: 'p', text: '8. DISCLOSURE SUMMARY / RESUMEN DE DIVULGACION' },
    { type: 'table', rows: [
      ['Principal Amount Financed / Monto financiado: {{pickup_finance_money}}', 'Annual Interest Rate / Interes anual: {{pickup_interest_rate_percent}}'],
      ['Finance Charge / Cargo financiero: {{pickup_finance_charge_money}}', 'Total of Payments / Total de pagos: {{pickup_total_payments_money}}'],
      ['Number of Payments / Numero de pagos: {{pickup_payment_count}}', 'Payment Frequency / Frecuencia: {{pickup_frequency_display}}'],
      ['First Payment Date / Primera fecha de pago: {{pickup_start_date_display}}', 'Card Processing Surcharge / Cargo tarjeta: 1.8% if paid by card / si se paga con tarjeta']
    ] },
    signatureHeading,
    signatureTable,
    { type: 'p', text: 'BY SIGNING, BORROWER ACKNOWLEDGES THAT BORROWER HAS READ, UNDERSTANDS, AND AGREES TO THIS AGREEMENT, THE PAYMENT SCHEDULE, AND THE RELATED VEHICLE SALE AND FINANCING DOCUMENTS.\nAL FIRMAR, EL DEUDOR RECONOCE QUE HA LEIDO, ENTIENDE Y ACEPTA ESTE ACUERDO, EL CALENDARIO DE PAGOS Y LOS DOCUMENTOS RELACIONADOS DE VENTA Y FINANCIAMIENTO DEL VEHICULO.' },
    footer
  ].filter(Boolean);
  doc.loanClausesApplied = true;
}
applyPickupLoanClauses(pickupDocument);

function esc(text) {
  return String(text || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
}

function raw(form, id) {
  return String(form?.[id] || '').trim();
}

function saleType(form) {
  return raw(form, 'sale_type') === 'VOLUNTARY' ? 'VOLUNTARY' : raw(form, 'sale_type') === 'BANCO' ? 'BANCO' : 'BHPH';
}

function selectedDocs(form) {
  const order = DOC_SETS[saleType(form)] || DOC_SETS.BHPH;
  return order.map(key => ALL_DOCS.find(doc => doc.key === key)).filter(Boolean);
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

function parseMoney(form, id) {
  return Number(raw(form, id).replace(/[^0-9.-]/g, '')) || 0;
}

function moneyFromNumber(amount) {
  return '$' + (Number(amount) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function downCollectedPercent(form) {
  const total = parseMoney(form, 'pickup_down_total');
  const paid = Math.min(total || parseMoney(form, 'pickup_down_paid_today'), parseMoney(form, 'pickup_down_paid_today'));
  return total > 0 ? `${((paid / total) * 100).toFixed(2)}%` : '';
}

function pickupFinanceAmount(form) {
  const total = parseMoney(form, 'pickup_down_total');
  const paid = Math.min(total || parseMoney(form, 'pickup_down_paid_today'), parseMoney(form, 'pickup_down_paid_today'));
  const calculated = Math.max(0, total - paid);
  return calculated || parseMoney(form, 'pickup_finance_amount');
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

function addMonths(date, months) {
  const next = new Date(date);
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

function conditionalDeadline(form) {
  const delivery = parseDate(raw(form, 'conditional_delivery_date')) || parseDate(raw(form, 'transaction_date')) || new Date();
  return formatDate(addDays(delivery, 10));
}

function last4(form) {
  return raw(form, 'card_last_four').replace(/\D/g, '').slice(-4);
}

function pickupPeriodicRate(form) {
  const annualRate = Math.min(30, Math.max(0, Number(raw(form, 'pickup_interest_rate')) || 0)) / 100;
  const frequency = raw(form, 'pickup_frequency');
  if (frequency === 'Bi-Weekly') return annualRate / 26;
  if (frequency === 'Monthly') return annualRate / 12;
  return annualRate / 52;
}

function pickupFrequencyDisplay(form) {
  const frequency = raw(form, 'pickup_frequency');
  if (frequency === 'Bi-Weekly') return 'Bi-Weekly / Bi-semanal';
  if (frequency === 'Monthly') return 'Monthly / Mensual';
  return 'Weekly / Semanal';
}

function pickupStartDate(form) {
  const explicit = parseDate(raw(form, 'pickup_start_date'));
  if (explicit) return explicit;
  const saleDate = parseDate(raw(form, 'transaction_date')) || new Date();
  const frequency = raw(form, 'pickup_frequency');
  if (frequency === 'Bi-Weekly') return addDays(saleDate, 14);
  if (frequency === 'Monthly') return addMonths(saleDate, 1);
  return addDays(saleDate, 7);
}

function pickupDueDate(form, start, index) {
  const frequency = raw(form, 'pickup_frequency');
  if (frequency === 'Bi-Weekly') return new Date(start.getFullYear(), start.getMonth(), start.getDate() + ((index - 1) * 14));
  if (frequency === 'Monthly') return addMonths(start, index - 1);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + ((index - 1) * 7));
}

function pickupScheduleDetails(form) {
  const amount = pickupFinanceAmount(form);
  const paymentCount = Math.min(14, Math.max(1, Number(raw(form, 'pickup_payment_count')) || 10));
  const rate = pickupPeriodicRate(form);
  const start = pickupStartDate(form);
  const principalCents = Math.round(amount * 100);
  const paymentCents = principalCents && rate > 0
    ? Math.round((principalCents / 100) * rate / (1 - Math.pow(1 + rate, -paymentCount)) * 100)
    : paymentCount ? Math.floor(principalCents / paymentCount) : 0;
  const rows = [];
  let balanceCents = principalCents;
  let totalPaymentCents = 0;
  let totalInterestCents = 0;
  for (let i = 1; i <= paymentCount; i++) {
    const interestCents = rate > 0 ? Math.round(balanceCents * rate) : 0;
    let currentPaymentCents = paymentCents;
    let currentPrincipalCents = currentPaymentCents - interestCents;
    if (i === paymentCount || currentPrincipalCents > balanceCents) {
      currentPrincipalCents = balanceCents;
      currentPaymentCents = currentPrincipalCents + interestCents;
    }
    balanceCents = Math.max(0, balanceCents - currentPrincipalCents);
    totalPaymentCents += currentPaymentCents;
    totalInterestCents += interestCents;
    rows.push({
      number: i,
      date: pickupDueDate(form, start, i),
      payment: currentPaymentCents / 100,
      interest: interestCents / 100,
      principal: currentPrincipalCents / 100,
      balance: balanceCents / 100
    });
  }
  return { rows, totalPayments: totalPaymentCents / 100, financeCharge: totalInterestCents / 100 };
}

function tokenValue(form, key) {
  if (key === 'pickup_down_total_money') return moneyValue(form, 'pickup_down_total');
  if (key === 'pickup_down_paid_today_money') return moneyValue(form, 'pickup_down_paid_today');
  if (key === 'pickup_down_collected_percent') return raw(form, 'pickup_down_collected_percent') || downCollectedPercent(form);
  if (key === 'pickup_finance_money') return moneyFromNumber(pickupFinanceAmount(form));
  if (key === 'pickup_interest_rate_percent') return `${Math.min(30, Math.max(0, Number(raw(form, 'pickup_interest_rate')) || 0)).toFixed(2)}%`;
  if (key === 'pickup_finance_charge_money') return raw(form, 'pickup_finance_charge') ? moneyValue(form, 'pickup_finance_charge') : moneyFromNumber(pickupScheduleDetails(form).financeCharge);
  if (key === 'pickup_total_payments_money') return raw(form, 'pickup_total_payments') ? moneyValue(form, 'pickup_total_payments') : moneyFromNumber(pickupScheduleDetails(form).totalPayments);
  if (key === 'pickup_frequency_display') return pickupFrequencyDisplay(form);
  if (key === 'pickup_start_date_display') return formatDate(pickupStartDate(form));
  if (key === 'pickup_card_last_four') return last4(form);
  if (key === 'vehicle_model_year') return vehicleModelYear(form);
  if (key === 'vehicle_year_make') return vehicleYearMake(form);
  if (key === 'vehicle_mileage_display') return formatMiles(form);
  if (key === 'transaction_date_display') return transactionDate(form);
  if (key === 'full_name') return fullName(form);
  if (key === 'surrender_date_display') return formatDate(parseDate(raw(form, 'surrender_date'))) || transactionDate(form);
  if (key === 'surrender_sale_date_display') {
    const base = parseDate(raw(form, 'surrender_date')) || parseDate(raw(form, 'transaction_date')) || new Date();
    return formatDate(addDays(base, 10));
  }
  if (key === 'surrender_payoff_money') return moneyValue(form, 'surrender_payoff');
  if (key === 'surrender_monthly_payment_money') return moneyValue(form, 'surrender_monthly_payment');
  if (key === 'surrender_amount_owed_money') {
    const existing = raw(form, 'surrender_amount_owed');
    if (existing) return moneyValue(form, 'surrender_amount_owed');
    return moneyFromNumber(parseMoney(form, 'surrender_monthly_payment') * (Number(raw(form, 'surrender_owed_installments')) || 0));
  }
  if (key === 'surrender_days_sold') {
    const sale = parseDate(raw(form, 'transaction_date'));
    const returned = parseDate(raw(form, 'surrender_date')) || new Date();
    return sale ? String(Math.max(0, Math.round((returned - sale) / 86400000))) : '';
  }
  if (key === 'conditional_delivery_date_display') return formatDate(parseDate(raw(form, 'conditional_delivery_date'))) || transactionDate(form);
  if (key === 'conditional_deadline_display') return raw(form, 'conditional_deadline') || conditionalDeadline(form);
  if (key === 'call_hours_en' || key === 'call_hours_es') {
    const chosen = raw(form, 'preferred_call_hours');
    return ['8am-12pm', '12pm-5pm', '5pm-9pm'].map(slot => `${chosen === slot ? '☑' : '☐'} ${slot}`).join('   ');
  }
  const amount = key.match(/^pickup_amount_(\d+)_money$/);
  if (amount) {
    const row = pickupScheduleDetails(form).rows[Number(amount[1]) - 1];
    return raw(form, `pickup_amount_${amount[1]}`) ? moneyValue(form, `pickup_amount_${amount[1]}`) : row ? moneyFromNumber(row.payment) : '';
  }
  const dueDate = key.match(/^pickup_date_(\d+)$/);
  if (dueDate) {
    const row = pickupScheduleDetails(form).rows[Number(dueDate[1]) - 1];
    return raw(form, key) || (row?.date ? formatDate(row.date) : '');
  }
  const scheduleValue = key.match(/^pickup_(interest|principal|balance)_(\d+)_money$/);
  if (scheduleValue) {
    const row = pickupScheduleDetails(form).rows[Number(scheduleValue[2]) - 1];
    return row ? moneyFromNumber(row[scheduleValue[1]]) : '';
  }
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
  const coBuyerCell = /(CO-BUYER|CO-COMPRADOR)/.test(out);

  out = markChoices(form, out);
  out = out.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key) => tokenValue(form, key));
  if (out.trim().startsWith('Stock Number:')) {
    out = `Stock Number: ${raw(form, 'stock_number')}   Contract No.: ${raw(form, 'contract_number')}   Date: ${date}`;
  }

  const fields = [
    ['Borrower / Deudor:', () => customerName],
    ['Customer / Cliente:', () => customerName],
    ['Co-Buyer / Co-Comprador:', () => raw(form, 'co_buyer_name')],
    ['Address / Direccion:', () => raw(form, 'address')],
    ['Address / Dirección:', () => raw(form, 'address')],
    ['City / State / ZIP:', () => cityStateZip(form)],
    ['Phone Number / Telefono:', () => raw(form, 'phone')],
    ['Phone Number / Teléfono:', () => raw(form, 'phone')],
    ['Driver License / Licencia:', () => raw(form, 'driver_license')],
    ['Year, Make, Model / Ano, Marca, Modelo:', () => vehicle(form)],
    ['Year, Make, Model / Año, Marca, Modelo:', () => vehicle(form)],
    ['Year, Make & Model / Vehículo:', () => vehicle(form)],
    ['Vehicle (Year, Make, Model) / Vehículo:', () => vehicle(form)],
    ['VIN:', () => raw(form, 'vin')],
    ['Mileage / Millas:', () => formatMiles(form)],
    ['Stock Number / Numero de Inventario:', () => raw(form, 'stock_number')],
    ['Stock Number / Número de Inventario:', () => raw(form, 'stock_number')],
    ['Retail Installment Contract No.:', () => raw(form, 'contract_number')],
    ['Transaction Date / Fecha de la Transaccion:', () => date],
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

  out = out.replace(/Printed Name \/ Nombre Impreso:\s*_{3,}/g, `Printed Name / Nombre Impreso: ${dealerCell ? sellerName : coBuyerCell ? raw(form, 'co_buyer_name') : customerName}`);
  out = out.replace(/Name\/Nombre:\s*_{5,}/g, `Name/Nombre: ${dealerCell ? sellerName : coBuyerCell ? raw(form, 'co_buyer_name') : customerName}`);
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
  out = out.replace(/_{8,}/g, '____________________________');
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
  return `<signature-field name="${esc(name)}" role="Customer" required="${required ? 'true' : 'false'}" format="typed" style="width: 180px; height: 34px; display: inline-block;"></signature-field>`;
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
    const field = isCustomer || isCoBuyer ? `<div class="sign-field">${signatureField(`${DOC_TITLES[doc?.key] || 'Document'} ${index + 1} Signature`, !isCoBuyer || Boolean(coBuyerName))}</div>` : '<div class="manual-line">X</div>';
    return `<td><strong>${label}</strong><div class="printed-name">Name/Nombre: ${esc(name)}</div>${field}<div class="printed-date">Date/Fecha: ${esc(date)}</div></td>`;
  }).join('');
  return `<table class="signature-table"><tbody><tr>${cells}</tr></tbody></table>`;
}

function renderTable(form, rows, doc, forceSignature = false) {
  const joined = rows.flat().join(' ');
  const compactEnough = joined.length < 1000 && rows.length <= 4;
  const signatureLike = forceSignature || (compactEnough && /(CUSTOMER|CLIENTE|BUYER|COMPRADOR|CARDHOLDER|BORROWER|DEUDOR|EASYCAR|DEALER|REP)/i.test(joined) && /(\bSIGNATURE\b|\bFIRMA(?:S)?\b|X _)/i.test(joined));
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
    .signature-table tr:first-child td { background: #fff; font-weight: 400; }
    .printed-name, .printed-date { margin-top: 2.5pt; }
    .manual-line { margin-top: 5pt; height: 18pt; border-bottom: .9pt solid #12233d; }
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
