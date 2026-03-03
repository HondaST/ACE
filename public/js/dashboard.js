/* ================================================================
   Tax Paladin — Client Dashboard
   Drives all 8 sections after login.
================================================================ */

const API = '/api/client';
const DEMO = new URLSearchParams(location.search).has('demo');

// State
let currentSuie   = null;   // selected tax entity unique id
let currentPrepId = null;   // assigned_prep emp_id for sending messages
let currentYear   = null;   // selected tax year
let pendingFile   = null;   // file awaiting type selection
let editingSuie   = null;   // suie being edited (null = create mode)

/* ── Demo / mock data (activated via ?demo in URL) ───────── */
const DEMO_DATA = {
  info:      { sui: 1, full_name: 'Tom Jones', cell: '631-555-1122', email: 'tjones@test.com' },
  entities:  [
    { tax_entity:'Tom Jones',        tax_type:'PERSONAL', tax_professional:'Alan Blakeborough', suie:'E001', assigned_prep:'EMP1', cell:'', email:'' },
    { tax_entity:'Jones Consulting', tax_type:'LLC',      tax_professional:'Alan Blakeborough', suie:'E002', assigned_prep:'EMP1', cell:'', email:'' }
  ],
  taxYears:  [{ tax_year:2024 }, { tax_year:2023 }, { tax_year:2022 }],
  invoices:  [
    { invoice_no:9832,  suie:1, tax_year:2024, inv_desc:'Tax Year 2024 tax return', inv_full_amount:250, inv_discount:10, inv_final_amount:240, inv_date:'2024-08-14', entityname:'Jones, Tom', taxidnumber:'111111122', bal_due:240, prep:'Blakeborough, Alan', client_email:'tjones@test.com', client_cell:'631-555-1122' },
    { invoice_no:12252, suie:1, tax_year:2024, inv_desc:'2024 Tax Return',           inv_full_amount:265, inv_discount:7,  inv_final_amount:258, inv_date:'2024-08-19', entityname:'Jones, Tom', taxidnumber:'111111122', bal_due:258, prep:'Blakeborough, Alan', client_email:'tjones@test.com', client_cell:'631-555-1122' }
  ],
  files:     [
    { file_info_id:1003, file_info_name:'Tax Paladin Overview.pdf', file_type_id:'Identity', file_size:86014, created_dt:'2025-07-28T11:33:00' },
    { file_info_id:1004, file_info_name:'Tax Paladin Overview.pdf', file_type_id:'Identity', file_size:86014, created_dt:'2025-07-28T11:43:00' }
  ],
  messages:  [
    { msg_id:1, msg_subject:'Hello',     msg_text:'Hello can you do my taxes?', sent_by_id:'C', from_person:'Tom Jones',          msg_create_dt:'2025-07-25T10:00:00' },
    { msg_id:2, msg_subject:'Re:Hello',  msg_text:'I would love to',             sent_by_id:'E', from_person:'Alan Blakeborough', msg_create_dt:'2025-07-25T10:05:00' },
    { msg_id:3, msg_subject:'Great',     msg_text:'Should I call you?',          sent_by_id:'C', from_person:'Tom Jones',          msg_create_dt:'2025-07-25T11:21:00' },
    { msg_id:4, msg_subject:'Will Call', msg_text:'No i will call you',          sent_by_id:'E', from_person:'Alan Blakeborough', msg_create_dt:'2025-07-31T16:37:00' }
  ]
};

/* ── Auth helper ─────────────────────────────────────────── */
function getToken() {
  return localStorage.getItem('token');
}

async function apiFetch(url, opts = {}) {
  if (DEMO) return null;          // demo mode uses direct DEMO_DATA calls, not apiFetch
  const token = getToken();
  if (!token) { redirectLogin(); return null; }

  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(opts.headers || {})
    }
  });

  if (res.status === 401) { redirectLogin(); return null; }

  return res.json();
}

function redirectLogin() {
  localStorage.removeItem('token');
  window.location.href = '/';
}

/* ── Formatting helpers ──────────────────────────────────── */
function fmtDateTime(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  const yr = String(d.getFullYear()).slice(-2);
  let hr = d.getHours(), ampm = 'am';
  if (hr >= 12) { ampm = 'pm'; if (hr > 12) hr -= 12; }
  if (hr === 0) hr = 12;
  const mn = String(d.getMinutes()).padStart(2, '0');
  return `${mo}/${dy}/${yr} ${hr}:${mn} ${ampm}`;
}

function fmtDateShort(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  const yr = String(d.getFullYear()).slice(-2);
  const hr = String(d.getHours()).padStart(2, '0');
  const mn = String(d.getMinutes()).padStart(2, '0');
  return `${mo}/${dy}/${yr} ${hr}:${mn}`;
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtTaxId(id) {
  if (!id) return '';
  const s = String(id).replace(/\D/g, '');
  if (s.length === 9) return `${s.slice(0,3)}-${s.slice(3,5)}-${s.slice(5)}`;
  return String(id);
}

function fmtInvDate(dt) {
  if (!dt) return '';
  const [yr, mo, dy] = String(dt).split('T')[0].split('-');
  return `${parseInt(mo)}/${dy}/${yr}`;
}

/* ================================================================
   INIT
================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  if (!DEMO && !getToken()) { redirectLogin(); return; }

  loadClientInfo();
  loadEntities();
  bindTabs();
  bindCompose();
  bindUpload();
  bindNewEntity();
  bindInvoiceEdit();
});

/* ================================================================
   SECTION 1 — Client Info
================================================================ */
async function loadClientInfo() {
  const info = DEMO ? DEMO_DATA.info : await apiFetch(`${API}/info`);
  if (!info) return;

  document.getElementById('client-name').textContent   = info.full_name || '—';
  document.getElementById('client-cell').textContent   = info.cell      || '—';
  document.getElementById('client-userid').textContent = info.sui       || '—';
  document.getElementById('client-email').textContent  = info.email     || '—';
}

/* ================================================================
   SECTION 3 — Tax Entities table
================================================================ */
async function loadEntities() {
  const entities = DEMO ? DEMO_DATA.entities : await apiFetch(`${API}/entities`);
  if (!entities) return;

  const tbody = document.getElementById('entities-tbody');
  tbody.innerHTML = '';

  if (!entities.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-row">No tax entities found.</td></tr>';
    return;
  }

  entities.forEach((entity, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(entity.tax_entity)}</td>
      <td>${esc(entity.tax_type)}</td>
      <td>${esc(entity.tax_professional)}</td>
      <td>${esc(entity.cell)}</td>
      <td>${esc(entity.email)}</td>
    `;
    tr.addEventListener('click', () => selectEntity(tr, entity));
    tr.addEventListener('dblclick', () => startEditEntity(entity));
    tbody.appendChild(tr);

    // Auto-select first row
    if (idx === 0) tr.click();
  });
}

function selectEntity(row, entity) {
  document.querySelectorAll('#entities-tbody tr').forEach(r => r.classList.remove('selected'));
  row.classList.add('selected');

  currentSuie   = entity.suie;
  currentPrepId = entity.assigned_prep;

  // Reload sections 4, 5, 6 in parallel
  loadTaxYears(currentSuie);
  loadFiles(currentSuie, null);
  loadMessages(currentSuie);
}

/* ================================================================
   SECTION 4 — Tax Years
================================================================ */
async function loadTaxYears(suie, targetYear = null) {
  const years = DEMO ? DEMO_DATA.taxYears : await apiFetch(`${API}/entities/${suie}/tax-years`);
  if (!years) return;

  const container = document.getElementById('tax-years');
  container.innerHTML = '';

  let matched = false;
  years.forEach((row, idx) => {
    const div = document.createElement('div');
    div.className = 'year-item';
    div.textContent = row.tax_year;
    div.addEventListener('click', () => selectYear(div, row.tax_year));
    container.appendChild(div);

    // Select targetYear if provided, otherwise auto-select first
    if (targetYear !== null && String(row.tax_year) === String(targetYear)) {
      div.click();
      matched = true;
    } else if (!targetYear && idx === 0) {
      div.click();
    }
  });

  // If targetYear wasn't in the list yet, fall back to first
  if (targetYear && !matched && years.length) {
    container.querySelector('.year-item').click();
  }
}

function selectYear(el, year) {
  document.querySelectorAll('.year-item').forEach(y => y.classList.remove('selected'));
  el.classList.add('selected');
  currentYear = year;
  loadFiles(currentSuie, year);
}

/* ================================================================
   SECTION 5 — Files
================================================================ */
async function loadFiles(suie, year) {
  if (!suie) return;

  const url = year
    ? `${API}/entities/${suie}/files?year=${year}`
    : `${API}/entities/${suie}/files`;

  const files = DEMO ? DEMO_DATA.files : await apiFetch(url);
  if (!files) return;

  const tbody = document.getElementById('files-tbody');
  tbody.innerHTML = '';

  if (!files.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-row">No files found.</td></tr>';
    return;
  }

  files.forEach(f => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(f.file_info_id)}</td>
      <td>${esc(f.file_info_name)}</td>
      <td>${esc(f.file_type_id)}</td>
      <td>${fmtDateShort(f.created_dt)}</td>
      <td>${esc(f.file_size)}</td>
    `;
    tr.addEventListener('dblclick', () => openFile(f.file_info_id));
    tbody.appendChild(tr);
  });
}

async function openFile(fileInfoId) {
  const token = getToken();
  try {
    const res = await fetch(`${API}/files/${fileInfoId}/open`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(`Could not open file: ${err.error || res.statusText}`);
      return;
    }
    const blob      = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    window.open(objectUrl, '_blank');
  } catch (e) {
    alert(`Could not open file: ${e.message}`);
  }
}

/* ================================================================
   SECTION 3 — Invoices table
================================================================ */
async function loadInvoices(suie) {
  const rows = DEMO
    ? DEMO_DATA.invoices
    : await apiFetch(`${API}/invoices/${suie}`);

  const tbody = document.getElementById('invoices-tbody');
  const tfoot = document.getElementById('invoices-tfoot');
  tbody.innerHTML = '';
  tfoot.innerHTML = '';

  // Reset Pay button whenever list reloads
  document.getElementById('pay-btn').disabled = true;

  if (!Array.isArray(rows)) {
    const msg = (rows && rows.error) ? `Error: ${esc(rows.error)}` : 'Error loading invoices.';
    tbody.innerHTML = `<tr><td colspan="13" class="empty-row">${msg}</td></tr>`;
    return;
  }

  // Filter to rows that actually have an invoice (LEFT JOIN may return null invoice_no)
  const invoices = rows.filter(r => r.invoice_no != null);

  if (!invoices.length) {
    tbody.innerHTML = '<tr><td colspan="13" class="empty-row">No invoices found.</td></tr>';
    return;
  }

  let totalDiscount = 0, totalAmount = 0, totalBalDue = 0;

  invoices.forEach(inv => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(inv.entityname)}</td>
      <td>${esc(fmtTaxId(inv.taxidnumber))}</td>
      <td class="num">${esc(inv.invoice_no)}</td>
      <td class="num">${esc(inv.tax_year)}</td>
      <td>${esc(inv.inv_desc)}</td>
      <td class="num">${esc(inv.inv_full_amount)}</td>
      <td class="num">${esc(inv.inv_discount)}</td>
      <td class="num">${esc(inv.inv_final_amount)}</td>
      <td class="num">${esc(inv.bal_due)}</td>
      <td>${esc(fmtInvDate(inv.inv_date))}</td>
      <td>${esc(inv.prep)}</td>
      <td>${esc(inv.client_email)}</td>
      <td>${esc(inv.client_cell)}</td>
    `;
    tr.addEventListener('click',  () => selectInvoice(tr, inv));
    tr.addEventListener('dblclick', () => openInvoiceEdit(inv));
    tbody.appendChild(tr);

    totalDiscount += Number(inv.inv_discount)    || 0;
    totalAmount   += Number(inv.inv_final_amount) || 0;
    totalBalDue   += Number(inv.bal_due)          || 0;
  });

  // Totals row
  const tfr = document.createElement('tr');
  tfr.innerHTML = `
    <td colspan="5"></td>
    <td class="total-cell"></td>
    <td class="total-cell num">${totalDiscount}</td>
    <td class="total-cell num">${totalAmount}</td>
    <td class="total-cell num">${totalBalDue}</td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
  `;
  tfoot.appendChild(tfr);
}

function selectInvoice(row, inv) {
  document.querySelectorAll('#invoices-tbody tr').forEach(r => r.classList.remove('selected'));
  row.classList.add('selected');
  document.getElementById('pay-btn').disabled = !(Number(inv.bal_due) > 0);
}

/* ================================================================
   SECTION 6 — Chat messages
================================================================ */
async function loadMessages(suie) {
  if (!suie) return;

  const messages = DEMO ? DEMO_DATA.messages : await apiFetch(`${API}/entities/${suie}/messages`);
  if (!messages) return;

  const container = document.getElementById('chat-messages');
  container.innerHTML = '';

  if (!messages.length) {
    container.innerHTML = '<div class="chat-placeholder">No messages yet.</div>';
    return;
  }

  messages.forEach(msg => {
    const isClient = msg.sent_by_id === 'C';
    const div = document.createElement('div');
    div.className = `msg-bubble ${isClient ? 'client' : 'preparer'}`;
    div.innerHTML = `
      <div class="msg-date">${esc(fmtDateTime(msg.msg_create_dt))}</div>
      <div class="msg-subject"><strong>Subject:</strong> ${esc(msg.msg_subject)}</div>
      <div class="msg-text"><strong>Msg:</strong> ${esc(msg.msg_text)}</div>
      <div class="msg-by"><strong>By:</strong> ${esc(msg.from_person)}</div>
    `;

    // Clicking a message pre-fills the subject with RE: prefix (Section 7)
    div.addEventListener('click', () => {
      const subjectInput = document.getElementById('msg-subject');
      const existing = subjectInput.value;
      const base = (msg.msg_subject || '').replace(/^RE:\s*/i, '');
      if (!existing.toLowerCase().startsWith('re:')) {
        subjectInput.value = `RE: ${base}`;
      }
      document.getElementById('msg-text').focus();
    });

    container.appendChild(div);
  });

  // Scroll to most recent message
  container.scrollTop = container.scrollHeight;
}

/* ================================================================
   SECTION 7 — Compose / Send
================================================================ */
function bindCompose() {
  document.getElementById('send-btn').addEventListener('click', sendMessage);
  document.getElementById('close-btn').addEventListener('click', clearCompose);
}

async function sendMessage() {
  const subject = document.getElementById('msg-subject').value.trim();
  const text    = document.getElementById('msg-text').value.trim();

  if (!subject || !text) {
    alert('Please enter both a subject and a message.');
    return;
  }
  if (!currentSuie || !currentPrepId) {
    alert('Please select a tax entity first.');
    return;
  }

  const result = await apiFetch(`${API}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      subject,
      text,
      suie:  currentSuie,
      to_id: currentPrepId
    })
  });

  if (result && result.success) {
    clearCompose();
    loadMessages(currentSuie);
  } else if (result && result.error) {
    alert(`Error: ${result.error}`);
  }
}

function clearCompose() {
  document.getElementById('msg-subject').value = '';
  document.getElementById('msg-text').value    = '';
}

/* ================================================================
   SECTION 3 — Tab switching
================================================================ */
function bindTabs() {
  document.getElementById('tab-entities').addEventListener('click', () => {
    document.getElementById('tab-entities').classList.add('active');
    document.getElementById('tab-invoices').classList.remove('active');
    document.getElementById('entities-panel').classList.remove('hidden');
    document.getElementById('invoices-panel').classList.add('hidden');
  });

  document.getElementById('tab-invoices').addEventListener('click', () => {
    document.getElementById('tab-invoices').classList.add('active');
    document.getElementById('tab-entities').classList.remove('active');
    document.getElementById('invoices-panel').classList.remove('hidden');
    document.getElementById('entities-panel').classList.add('hidden');
    loadInvoices(currentSuie);
  });

  document.getElementById('pay-btn').addEventListener('click', () => {
    alert('Payment functionality will be defined separately.');
  });
}

/* ================================================================
   SECTION 2 — New Entity type selection modal
================================================================ */
function bindNewEntity() {
  const overlay   = document.getElementById('entity-type-overlay');
  const radios    = () => document.querySelectorAll('input[name="entity-type"]');
  const closeModal = () => {
    overlay.classList.add('hidden');
    radios().forEach(r => r.checked = false);
  };

  // Open modal
  document.getElementById('new-entity-btn').addEventListener('click', () => {
    radios().forEach(r => r.checked = false);
    overlay.classList.remove('hidden');
  });

  // X button
  document.getElementById('entity-type-close').addEventListener('click', closeModal);

  // Cancel button
  document.getElementById('entity-type-cancel-btn').addEventListener('click', closeModal);

  // Select button — capture chosen type, then proceed to next step
  document.getElementById('entity-type-select-btn').addEventListener('click', () => {
    const selected = document.querySelector('input[name="entity-type"]:checked');
    if (!selected) { alert('Please select a tax entity type.'); return; }
    closeModal();
    startNewEntity(selected.value);
  });


  // === Create Entity modal buttons ===
  document.getElementById('ce-close-x').addEventListener('click',   closeCeModal);
  document.getElementById('ce-close-btn').addEventListener('click', closeCeModal);
  document.getElementById('ce-save-btn').addEventListener('click',  saveNewEntity);
  document.getElementById('ce-print-btn').addEventListener('click', () => window.print());

  // Tax ID blur — check uniqueness as soon as the user leaves the field
  document.getElementById('ce-taxid').addEventListener('blur', async () => {
    const taxid      = document.getElementById('ce-taxid').value.trim();
    const entityType = document.getElementById('ce-entity-type').value;
    const errEl      = document.getElementById('ce-taxid-error');
    if (!taxid || !entityType) { errEl.classList.add('hidden'); return; }
    const result = await checkTaxIdInUse(taxid, entityType, editingSuie);
    errEl.classList.toggle('hidden', !result);
  });
}

function closeCeModal() {
  document.getElementById('create-entity-overlay').classList.add('hidden');
  editingSuie = null;
  document.getElementById('ce-modal-title').textContent = 'Create Tax Entity';
  document.getElementById('ce-taxid-error').classList.add('hidden');
}

// Returns true if the given tax ID is already in use by another entity of the same category
async function checkTaxIdInUse(taxid, entityType, excludeSuie = null) {
  if (DEMO) return false;
  let url = `${API}/check-taxid?taxidnumber=${encodeURIComponent(taxid)}&entity_type=${encodeURIComponent(entityType)}`;
  if (excludeSuie) url += `&exclude_suie=${encodeURIComponent(excludeSuie)}`;
  const result = await apiFetch(url);
  return result ? result.inUse : false;
}

// Opens the Create Entity form pre-set to the chosen entityType (et_id)
async function startNewEntity(etId) {
  const isPersonal = etId === 'PERS';

  // Auto-fill created date
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  document.getElementById('ce-created-date').value =
    `${now.getMonth()+1}/${now.getDate()}/${now.getFullYear()} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  // Clear all editable fields and error states
  ['ce-entity-id','ce-taxid','ce-first-name','ce-last-name','ce-entity-name',
   'ce-street','ce-city','ce-state','ce-zipcode','ce-cell','ce-email'
  ].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('ce-taxid-error').classList.add('hidden');

  // Toggle personal vs non-personal name section
  document.getElementById('ce-personal-section').classList.toggle('hidden', !isPersonal);
  document.getElementById('ce-nonpersonal-section').classList.toggle('hidden', isPersonal);

  // Populate Entity Type dropdown (disabled — pre-set from type screen)
  await loadEntityTypesForForm(etId);

  // Populate Assigned Prep dropdown
  await loadPreparersForForm();

  document.getElementById('create-entity-overlay').classList.remove('hidden');
}

// Opens the Create Entity form populated with existing entity data (edit mode)
async function startEditEntity(listEntity) {
  const entity = DEMO
    ? listEntity
    : await apiFetch(`${API}/entities/${listEntity.suie}`);
  if (!entity) return;

  editingSuie = listEntity.suie;
  document.getElementById('ce-modal-title').textContent = 'Edit Tax Entity';
  document.getElementById('ce-taxid-error').classList.add('hidden');

  const isPersonal = (entity.entity_type || entity.tax_type) === 'PERS';

  document.getElementById('ce-entity-id').value    = entity.suie || '';
  document.getElementById('ce-taxid').value        = entity.taxidnumber || '';
  document.getElementById('ce-first-name').value   = entity.first_name  || '';
  document.getElementById('ce-last-name').value    = entity.last_name   || '';
  document.getElementById('ce-entity-name').value  = entity.entityname  || '';
  document.getElementById('ce-street').value       = entity.street      || '';
  document.getElementById('ce-city').value         = entity.city        || '';
  document.getElementById('ce-state').value        = entity.state       || '';
  document.getElementById('ce-zipcode').value      = entity.zipcode     || '';
  document.getElementById('ce-cell').value         = entity.cell        || '';
  document.getElementById('ce-email').value        = entity.email       || '';

  // Format created date
  if (entity.created_date) {
    const d = new Date(entity.created_date);
    const pad = n => String(n).padStart(2, '0');
    document.getElementById('ce-created-date').value =
      `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  document.getElementById('ce-personal-section').classList.toggle('hidden', !isPersonal);
  document.getElementById('ce-nonpersonal-section').classList.toggle('hidden', isPersonal);

  await loadEntityTypesForForm(entity.entity_type);
  await loadPreparersForForm(entity.assigned_prep);

  document.getElementById('create-entity-overlay').classList.remove('hidden');
}

async function loadEntityTypesForForm(selectedEtId) {
  const sel = document.getElementById('ce-entity-type');
  sel.innerHTML = '';
  const types = await apiFetch(`${API}/entity-types`);
  if (types && types.length) {
    types.forEach(t => {
      const opt = document.createElement('option');
      opt.value       = t.et_id;
      opt.textContent = t.et_desc;
      if (t.et_id === selectedEtId) opt.selected = true;
      sel.appendChild(opt);
    });
  } else {
    // Fallback: add just the selected value if API fails
    const opt = document.createElement('option');
    opt.value = selectedEtId;
    opt.textContent = selectedEtId;
    sel.appendChild(opt);
  }
}

async function loadPreparersForForm(selectedEmpId = null) {
  const sel = document.getElementById('ce-assigned-prep');
  sel.innerHTML = '<option value="">— optional —</option>';
  const preps = await apiFetch(`${API}/preparers`);
  if (preps && preps.length) {
    preps.forEach(p => {
      const opt = document.createElement('option');
      opt.value       = p.emp_id;
      opt.textContent = `${p.last_name}, ${p.first_name}`;
      if (String(p.emp_id) === String(selectedEmpId)) opt.selected = true;
      sel.appendChild(opt);
    });
  }
}

async function saveNewEntity() {
  const entityType   = document.getElementById('ce-entity-type').value;
  const isPersonal   = entityType === 'PERS';
  const firstName    = isPersonal ? document.getElementById('ce-first-name').value.trim() : null;
  const lastName     = isPersonal ? document.getElementById('ce-last-name').value.trim()  : null;
  const entityName   = !isPersonal ? document.getElementById('ce-entity-name').value.trim() : null;
  const street       = document.getElementById('ce-street').value.trim();
  const city         = document.getElementById('ce-city').value.trim();
  const state        = document.getElementById('ce-state').value.trim();
  const zipcode      = document.getElementById('ce-zipcode').value.trim();
  const cell         = document.getElementById('ce-cell').value.trim();
  const email        = document.getElementById('ce-email').value.trim();
  const taxid        = document.getElementById('ce-taxid').value.trim();
  const assignedPrep = document.getElementById('ce-assigned-prep').value;

  // If a tax ID was entered, confirm it is not already in use before saving
  if (taxid) {
    const inUse = await checkTaxIdInUse(taxid, entityType, editingSuie);
    if (inUse) {
      document.getElementById('ce-taxid-error').classList.remove('hidden');
      document.getElementById('ce-taxid').focus();
      return;
    }
  }

  // Validate required fields (taxid and assigned_prep are optional)
  if (isPersonal) {
    if (!firstName) { alert('First Name is required.'); return; }
    if (!lastName)  { alert('Last Name is required.');  return; }
  } else {
    if (!entityName) { alert('Entity Name is required.'); return; }
  }
  if (!street)  { alert('Street is required.');  return; }
  if (!city)    { alert('City is required.');    return; }
  if (!state)   { alert('State is required.');   return; }
  if (!zipcode) { alert('Zipcode is required.'); return; }

  const payload = {
    entity_type:  entityType,
    taxidnumber:  taxid      || null,
    first_name:   firstName,
    last_name:    lastName,
    entity_name:  entityName,
    street, city, state, zipcode, cell, email,
    assigned_prep: assignedPrep || null
  };

  if (editingSuie) {
    const result = await apiFetch(`${API}/entities/${editingSuie}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    if (result && result.success) {
      loadEntities();
      closeCeModal();
    } else if (result && result.error) {
      alert(`Save failed: ${result.error}`);
    }
  } else {
    const result = await apiFetch(`${API}/entities`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (result && result.suie) {
      loadEntities();
      closeCeModal();
    } else if (result && result.error) {
      alert(`Save failed: ${result.error}`);
    }
  }
}

/* ================================================================
   SECTION 8 — Upload (button + drag-and-drop)
================================================================ */
function bindUpload() {
  const fileInput = document.getElementById('file-input');
  const dropZone  = document.querySelector('.section-5');

  // Upload button → open file dialog
  document.getElementById('upload-btn').addEventListener('click', () => {
    if (!currentSuie) { alert('Please select a tax entity first.'); return; }
    fileInput.click();
  });

  // File dialog selection → show file-type modal
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) showFileTypeModal(fileInput.files[0]);
    fileInput.value = ''; // reset so the same file can be re-selected
  });

  // Drag over section-5 — highlight drop zone
  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('drop-zone-active');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drop-zone-active');
  });

  // Drop → show file-type modal
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drop-zone-active');
    if (!currentSuie) { alert('Please select a tax entity first.'); return; }
    const file = e.dataTransfer.files[0];
    if (file) showFileTypeModal(file);
  });

  // Modal buttons
  document.getElementById('modal-upload-btn').addEventListener('click', () => {
    const fileTypeId = document.getElementById('filetype-select').value;
    const taxYear    = document.getElementById('taxyear-input').value.trim();
    if (!fileTypeId) { alert('Please select a file type.'); return; }
    if (!taxYear || !/^\d{4}$/.test(taxYear)) { alert('Please enter a valid 4-digit tax year.'); return; }
    hideFileTypeModal();
    uploadFile(pendingFile, fileTypeId, taxYear);
  });

  document.getElementById('modal-cancel-btn').addEventListener('click', () => {
    hideFileTypeModal();
    pendingFile = null;
  });
}

async function showFileTypeModal(file) {
  pendingFile = file;

  // Populate filename label
  document.getElementById('modal-filename').textContent = `File: ${file.name}`;

  // Load file types and populate dropdown
  const sel = document.getElementById('filetype-select');
  sel.innerHTML = '<option value="">— choose —</option>';

  const types = await apiFetch(`${API}/file-types`);
  if (types && types.length) {
    types.forEach(t => {
      const opt = document.createElement('option');
      opt.value       = t.file_type_id;
      opt.textContent = t.file_type_desc;
      sel.appendChild(opt);
    });
  }

  // Pre-fill tax year from current selection, fall back to current calendar year
  document.getElementById('taxyear-input').value =
    currentYear || new Date().getFullYear();

  document.getElementById('filetype-overlay').classList.remove('hidden');
}

function hideFileTypeModal() {
  document.getElementById('filetype-overlay').classList.add('hidden');
  document.getElementById('filetype-select').value = '';
  document.getElementById('taxyear-input').value   = '';
}

async function uploadFile(file, fileTypeId, taxYear) {
  const token = getToken();

  // Read file as raw bytes — avoids all multipart parsing complexity
  const arrayBuffer = await file.arrayBuffer();

  // All metadata goes in the URL; only the raw bytes go in the body
  let url = `${API}/upload/${encodeURIComponent(currentSuie)}`
          + `?file_type_id=${encodeURIComponent(fileTypeId)}`
          + `&filename=${encodeURIComponent(file.name)}`;
  if (taxYear) url += `&tax_year=${encodeURIComponent(taxYear)}`;

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/octet-stream'
      },
      body: arrayBuffer
    });

    const data = await res.json();
    if (!res.ok) {
      alert(`Upload failed: ${data.error || res.statusText}`);
      return;
    }

    // Reload tax years and highlight the year used for this upload
    loadTaxYears(currentSuie, taxYear);
  } catch (e) {
    alert(`Upload failed: ${e.message}`);
  }
}

/* ================================================================
   Invoice Edit modal
================================================================ */
function bindInvoiceEdit() {
  document.getElementById('inv-close-x').addEventListener('click',   closeInvoiceEdit);
  document.getElementById('inv-close-btn').addEventListener('click', closeInvoiceEdit);
  document.getElementById('inv-save-btn').addEventListener('click',  saveInvoiceEdit);
  document.getElementById('inv-print-btn').addEventListener('click', () => window.print());

  // Tab switching
  document.getElementById('inv-tab-invoice').addEventListener('click', () => {
    document.getElementById('inv-tab-invoice').classList.add('inv-tab-active');
    document.getElementById('inv-tab-payments').classList.remove('inv-tab-active');
    document.getElementById('inv-invoice-panel').classList.remove('hidden');
    document.getElementById('inv-payments-panel').classList.add('hidden');
  });
  document.getElementById('inv-tab-payments').addEventListener('click', () => {
    document.getElementById('inv-tab-payments').classList.add('inv-tab-active');
    document.getElementById('inv-tab-invoice').classList.remove('inv-tab-active');
    document.getElementById('inv-payments-panel').classList.remove('hidden');
    document.getElementById('inv-invoice-panel').classList.add('hidden');
  });

  // Auto-calculate Final Amount when From Value or Discount changes
  ['inv-full-amount', 'inv-discount'].forEach(id => {
    document.getElementById(id).addEventListener('input', recalcFinalAmount);
  });
}

function recalcFinalAmount() {
  const full     = parseFloat(document.getElementById('inv-full-amount').value)  || 0;
  const discount = parseFloat(document.getElementById('inv-discount').value)     || 0;
  document.getElementById('inv-final-amount').value = (full - discount).toFixed(2);
}

async function openInvoiceEdit(listInv) {
  const inv = DEMO
    ? listInv
    : await apiFetch(`${API}/invoice-detail/${listInv.invoice_no}`);
  if (!inv) return;

  // Title
  document.getElementById('inv-modal-title').textContent = `Invoice Number ${inv.invoice_no}`;

  // Client Contact section
  document.getElementById('inv-client-name').textContent    = inv.client_name || '';
  document.getElementById('inv-client-contact').textContent =
    `Cell: ${inv.client_cell || ''}   Email: ${inv.client_email || ''}`;

  // Tax Entity Information section
  document.getElementById('inv-entity-name').textContent    = inv.entityname || '';
  document.getElementById('inv-entity-street').textContent  = inv.street     || '';
  document.getElementById('inv-entity-csz').textContent     =
    `${inv.city || ''}, ${inv.state || ''}  ${inv.zipcode || ''}`.trim();
  document.getElementById('inv-entity-contact').textContent =
    `Cell: ${inv.entity_cell || ''}   Email: ${inv.entity_email || ''}`;

  // Readonly fields
  document.getElementById('inv-invoice-no').value = inv.invoice_no || '';
  document.getElementById('inv-date').value        = inv.inv_date ? fmtInvDate(inv.inv_date) : '';
  document.getElementById('inv-preparer').value    = inv.prep || '';

  // Editable fields
  document.getElementById('inv-tax-year').value    = inv.tax_year    || '';
  document.getElementById('inv-desc').value        = inv.inv_desc    || '';
  document.getElementById('inv-full-amount').value = inv.inv_full_amount != null ? Number(inv.inv_full_amount).toFixed(2) : '';
  document.getElementById('inv-discount').value    = inv.inv_discount    != null ? Number(inv.inv_discount).toFixed(2)    : '';
  document.getElementById('inv-final-amount').value = inv.inv_final_amount != null ? Number(inv.inv_final_amount).toFixed(2) : '';

  // RT dropdown
  const rtSel = document.getElementById('inv-rt');
  rtSel.value = inv.rt || 'No';

  // Office dropdown — load offices for this employee's ERO
  const officeSel = document.getElementById('inv-office');
  officeSel.innerHTML = '<option value="">— select —</option>';
  const offices = await apiFetch(`${API}/offices-by-employee/${encodeURIComponent(inv.emp_id)}`);
  if (offices && offices.length) {
    offices.forEach(o => {
      const opt = document.createElement('option');
      opt.value       = o.office_id;
      opt.textContent = `${o.office_id}-${o.office_name}`;
      if (o.office_id === inv.office_id) opt.selected = true;
      officeSel.appendChild(opt);
    });
  }

  // Reset to Invoice tab
  document.getElementById('inv-tab-invoice').classList.add('inv-tab-active');
  document.getElementById('inv-tab-payments').classList.remove('inv-tab-active');
  document.getElementById('inv-invoice-panel').classList.remove('hidden');
  document.getElementById('inv-payments-panel').classList.add('hidden');

  document.getElementById('invoice-edit-overlay').classList.remove('hidden');
}

function closeInvoiceEdit() {
  document.getElementById('invoice-edit-overlay').classList.add('hidden');
}

async function saveInvoiceEdit() {
  if (DEMO) { closeInvoiceEdit(); return; }
  const invoiceNo = document.getElementById('inv-invoice-no').value;
  const taxYear   = document.getElementById('inv-tax-year').value.trim();

  if (!taxYear || !/^\d{4}$/.test(taxYear)) {
    alert('Please enter a valid 4-digit tax year.');
    document.getElementById('inv-tax-year').focus();
    return;
  }

  const result = await apiFetch(`${API}/invoices/${invoiceNo}`, {
    method: 'PUT',
    body: JSON.stringify({
      tax_year:        taxYear,
      inv_desc:        document.getElementById('inv-desc').value.trim(),
      inv_full_amount: document.getElementById('inv-full-amount').value,
      inv_discount:    document.getElementById('inv-discount').value,
      office_id:       document.getElementById('inv-office').value,
      rt:              document.getElementById('inv-rt').value
    })
  });

  if (result && result.success) {
    closeInvoiceEdit();
    loadInvoices(currentSuie);   // refresh the invoices list
  } else if (result && result.error) {
    alert(`Save failed: ${result.error}`);
  }
}
