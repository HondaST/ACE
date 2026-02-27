/* ================================================================
   Tax Paladin — Client Dashboard
   Drives all 8 sections after login.
================================================================ */

const API = '/api/client';
const DEMO = new URLSearchParams(location.search).has('demo');

// State
let currentSuie   = null;   // selected tax entity unique id
let currentPrepId = null;   // assigned_prep emp_id for sending messages

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
async function loadTaxYears(suie) {
  const years = DEMO ? DEMO_DATA.taxYears : await apiFetch(`${API}/entities/${suie}/tax-years`);
  if (!years) return;

  const container = document.getElementById('tax-years');
  container.innerHTML = '';

  years.forEach((row, idx) => {
    const div = document.createElement('div');
    div.className = 'year-item';
    div.textContent = row.tax_year;
    div.addEventListener('click', () => selectYear(div, row.tax_year));
    container.appendChild(div);

    // Auto-select first year
    if (idx === 0) div.click();
  });
}

function selectYear(el, year) {
  document.querySelectorAll('.year-item').forEach(y => y.classList.remove('selected'));
  el.classList.add('selected');
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
    tbody.appendChild(tr);
  });
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
    tr.addEventListener('click', () => selectInvoice(tr, inv));
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
   SECTION 2 — New Entity (separate window — placeholder)
================================================================ */
function bindNewEntity() {
  document.getElementById('new-entity-btn').addEventListener('click', () => {
    // New Entity window to be defined separately
    alert('New Entity window will be defined separately.');
  });
}

/* ================================================================
   SECTION 8 — Upload (separate definition — placeholder)
================================================================ */
function bindUpload() {
  document.getElementById('upload-btn').addEventListener('click', () => {
    // Upload functionality to be defined separately
    alert('Upload functionality will be defined separately.');
  });
}
