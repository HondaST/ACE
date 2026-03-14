/* ══════════════════════════════════════════════════════
   Tax Paladin — Employee Portal Dashboard
   ══════════════════════════════════════════════════════ */

// ── Auth guard ─────────────────────────────────────────
const empToken = localStorage.getItem('emp_token');
const empName  = localStorage.getItem('emp_name') || '';
if (!empToken) window.location.href = '/';
document.getElementById('headerName').textContent = empName;

// ── State ──────────────────────────────────────────────
let currentSuie      = null;  // selected entity
let currentInvoiceNo = null;  // invoice open in modal
let selectedTaxYear  = null;  // tax year filter for files
let uploadFile_      = null;

// ── API helper ─────────────────────────────────────────
async function apiFetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'Authorization': `Bearer ${empToken}`, ...(opts.headers || {}) }
  });
  if (res.status === 401) { logout(); return null; }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    alert(err.error || 'An error occurred');
    return null;
  }
  return res.json();
}

function logout() {
  localStorage.removeItem('emp_token');
  localStorage.removeItem('emp_name');
  window.location.href = '/';
}

// ── Formatters ─────────────────────────────────────────
function fmt$(n) {
  const v = Number(n);
  if (n == null || isNaN(v)) return '';
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
}
function fmtSize(b) {
  if (!b) return '';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
  return (b/1048576).toFixed(1) + ' MB';
}
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Modal helpers ──────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.add('open');    }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function showAlert(id, msg, type='error') {
  const el = document.getElementById(id);
  if (el) el.innerHTML = `<div class="alert alert-${type}">${msg}</div>`;
}
function clearAlert(id) { const el = document.getElementById(id); if (el) el.innerHTML = ''; }

document.querySelectorAll('.modal-overlay').forEach(o =>
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); })
);

// ── SECTION 1: SEARCH ─────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.closest('#search-filters')) doSearch();
});

async function doSearch() {
  const params = new URLSearchParams();
  const v = id => document.getElementById(id).value.trim();

  if (v('f_client'))    params.set('client',     v('f_client'));
  if (v('f_taxid'))     params.set('tax_id',      v('f_taxid'));
  if (v('f_invoice'))   params.set('invoice_no',  v('f_invoice'));
  if (v('f_year'))      params.set('tax_year',    v('f_year'));
  if (v('f_email'))     params.set('email',       v('f_email'));
  if (v('f_date_from')) params.set('date_from',   v('f_date_from'));
  if (v('f_date_to'))   params.set('date_to',     v('f_date_to'));
  if (v('f_cell'))      params.set('cell',        v('f_cell'));
  if (v('f_preparer'))  params.set('preparer',    v('f_preparer'));
  if (v('f_office'))    params.set('office_id',   v('f_office'));
  if (document.getElementById('f_bal_due').checked) params.set('balance_due', 'true');

  const btn = document.getElementById('findBtn');
  btn.disabled = true;
  btn.textContent = 'Searching…';

  const rows = await apiFetch(`/api/employee/search?${params}`);

  btn.disabled = false;
  btn.textContent = 'Find';

  if (!rows) return;
  renderGrid(rows);
}

function clearSearch() {
  ['f_client','f_taxid','f_invoice','f_year','f_email','f_date_from','f_date_to','f_cell','f_preparer','f_office'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('f_bal_due').checked = false;
  clearSelection();
  document.getElementById('grid-body').innerHTML =
    '<tr><td colspan="11" class="grid-hint">Use the search above and click Find to load clients</td></tr>';
  document.getElementById('grid-foot').style.display = 'none';
}

// ── SECTION 3: INVOICE GRID ───────────────────────────
function renderGrid(rows) {
  const tbody = document.getElementById('grid-body');

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="11" class="grid-hint">No results found</td></tr>';
    document.getElementById('grid-foot').style.display = 'none';
    return;
  }

  // Accumulate footer totals (skip voids and null invoices)
  let totFee = 0, totDisc = 0, totAmt = 0, totBal = 0;

  tbody.innerHTML = rows.map(r => {
    const isVoid = r.void_ind === 'Y';
    if (r.invoice_no && !isVoid) {
      totFee  += Number(r.inv_full_amount)  || 0;
      totDisc += Number(r.inv_discount)     || 0;
      totAmt  += Number(r.inv_final_amount) || 0;
      totBal  += Number(r.bal_due)          || 0;
    }

    const voidBadge = isVoid ? ' <span class="badge-void">Void</span>' : '';

    return `<tr data-suie="${esc(r.suie)}" data-invoice="${r.invoice_no || ''}"
                data-owner-name="${esc(r.owner_name)}"
                data-owner-cell="${esc(r.owner_cell)}"
                data-owner-email="${esc(r.owner_email)}"
                data-owner-sui="${esc(r.owner_sui)}"
                onclick="selectRow(this)"
                ondblclick="onRowDblClick(this)">
      <td>${esc(r.display_name)}</td>
      <td>${esc(r.taxidnumber || '')}</td>
      <td>${r.invoice_no ? r.invoice_no + voidBadge : ''}</td>
      <td>${r.tax_year || ''}</td>
      <td>${esc(r.inv_desc || '')}</td>
      <td class="num">${r.invoice_no ? fmt$(r.inv_full_amount)  : ''}</td>
      <td class="num">${r.invoice_no ? fmt$(r.inv_discount)     : ''}</td>
      <td class="num">${r.invoice_no ? fmt$(r.inv_final_amount) : ''}</td>
      <td class="num${r.invoice_no && !isVoid && Number(r.bal_due) > 0 ? ' bal-due-red' : ''}">${r.invoice_no && !isVoid ? fmt$(r.bal_due) : ''}</td>
      <td>${fmtDate(r.inv_date)}</td>
      <td>${esc(r.prep_name || '')}</td>
    </tr>`;
  }).join('');

  // Footer totals
  document.getElementById('grid-foot').style.display = '';
  document.getElementById('ft-fee').textContent  = fmt$(totFee);
  document.getElementById('ft-disc').textContent = fmt$(totDisc);
  document.getElementById('ft-amt').textContent  = fmt$(totAmt);
  document.getElementById('ft-bal').textContent  = fmt$(totBal);
}

// ── ROW SELECTION ──────────────────────────────────────
function selectRow(tr) {
  // Deselect all
  document.querySelectorAll('#grid-body tr.selected').forEach(r => r.classList.remove('selected'));
  tr.classList.add('selected');

  const suie = tr.dataset.suie;
  const changed = suie !== currentSuie;
  currentSuie = suie;

  // Section 2: client info
  document.getElementById('client-info-box').classList.remove('hidden');
  document.getElementById('client-info-empty').style.display = 'none';
  document.getElementById('ci-name').textContent    = tr.dataset.ownerName  || '—';
  document.getElementById('ci-cell').textContent    = tr.dataset.ownerCell  || '—';
  document.getElementById('ci-email').textContent   = tr.dataset.ownerEmail || '—';
  document.getElementById('ci-userid').textContent  = tr.dataset.ownerSui   || '—';

  // Enable bottom buttons
  document.getElementById('createInvBtn').disabled = false;
  document.getElementById('uploadBtn').disabled    = false;
  document.getElementById('sendMsgBtn').disabled   = false;

  if (changed) {
    selectedTaxYear = null;
    loadTaxYears();   // auto-selects most recent year and calls loadFiles
    loadMessages();
  }
}

function clearSelection() {
  currentSuie     = null;
  selectedTaxYear = null;
  document.querySelectorAll('#grid-body tr.selected').forEach(r => r.classList.remove('selected'));
  document.getElementById('client-info-box').classList.add('hidden');
  document.getElementById('client-info-empty').style.display = '';
  document.getElementById('createInvBtn').disabled = true;
  document.getElementById('uploadBtn').disabled    = true;
  document.getElementById('sendMsgBtn').disabled   = true;
  document.getElementById('tax-year-list').innerHTML = '';
  document.getElementById('files-body').innerHTML =
    '<tr><td colspan="6" class="grid-hint">—</td></tr>';
  document.getElementById('msg-thread').innerHTML = '';
}

// Double-click on invoice row → open edit modal
function onRowDblClick(tr) {
  const invoiceNo = parseInt(tr.dataset.invoice);
  if (invoiceNo) openEditInvoiceModal(invoiceNo);
}

// ── SECTION 5: TAX YEARS ──────────────────────────────
async function loadTaxYears() {
  if (!currentSuie) return;
  const files = await apiFetch(`/api/employee/clients/${currentSuie}/files`);
  if (!files) return;

  // Extract distinct years from files, sorted most recent first
  const distinct = [...new Set(files.map(f => f.tax_year).filter(Boolean))].sort((a,b) => b-a);

  const list = document.getElementById('tax-year-list');
  if (!distinct.length) {
    list.innerHTML = '<div style="padding:8px 10px;font-size:12px;color:var(--gray-500)">No years</div>';
    selectedTaxYear = null;
    loadFiles();
    return;
  }

  // Auto-select most recent year
  selectedTaxYear = distinct[0];

  list.innerHTML = distinct.map(y =>
    `<div class="tax-year-item ${y === selectedTaxYear ? 'active' : ''}"
          onclick="selectTaxYear(${y})">${y}</div>`
  ).join('');

  loadFiles();
}

function selectTaxYear(year) {
  if (selectedTaxYear === year) {
    // Deselect — show all files
    selectedTaxYear = null;
    document.querySelectorAll('.tax-year-item').forEach(el => el.classList.remove('active'));
  } else {
    selectedTaxYear = year;
    document.querySelectorAll('.tax-year-item').forEach(el =>
      el.classList.toggle('active', parseInt(el.textContent) === year)
    );
  }
  loadFiles();
}

// ── SECTION 4: FILES ──────────────────────────────────
async function loadFiles() {
  if (!currentSuie) return;
  const url = selectedTaxYear
    ? `/api/employee/clients/${currentSuie}/files?year=${selectedTaxYear}`
    : `/api/employee/clients/${currentSuie}/files`;
  const files = await apiFetch(url);
  if (!files) return;

  const tbody = document.getElementById('files-body');
  if (!files.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="grid-hint">No files</td></tr>';
    return;
  }

  tbody.innerHTML = files.map(f => `
    <tr>
      <td>${f.file_info_id}</td>
      <td>${esc(f.file_info_name)}</td>
      <td>${esc(f.file_type_desc || f.file_type_id || '')}</td>
      <td>${fmtDate(f.created_dt)}</td>
      <td>${fmtSize(f.file_size)}</td>
      <td><a href="/api/employee/files/${f.file_info_id}/open" target="_blank" class="link-btn">Open</a></td>
    </tr>
  `).join('');
}

// ── SECTION 6–8: MESSAGES ─────────────────────────────
async function loadMessages() {
  if (!currentSuie) return;
  const msgs = await apiFetch(`/api/employee/clients/${currentSuie}/messages`);
  if (!msgs) return;

  const thread = document.getElementById('msg-thread');
  if (!msgs.length) {
    thread.innerHTML = '<div style="font-size:11px;color:var(--gray-500);text-align:center;padding:8px">No messages</div>';
    return;
  }

  thread.innerHTML = msgs.map(m => {
    const fromEmp = m.sent_by_id === 'E';
    return `<div class="msg-bubble ${fromEmp ? 'from-emp' : 'from-client'}">
      <div class="msg-meta">${fromEmp ? 'You' : esc(m.from_person || 'Client')} · ${fmtDate(m.msg_create_dt)}</div>
      <strong>${esc(m.msg_subject)}</strong><br>${esc(m.msg_text)}
    </div>`;
  }).join('');

  thread.scrollTop = thread.scrollHeight;
}

async function sendMessage() {
  const subject = document.getElementById('msgSubject').value.trim();
  const text    = document.getElementById('msgText').value.trim();
  if (!subject || !text) { alert('Please fill in Subject and Message.'); return; }

  const res = await apiFetch('/api/employee/messages', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ subject, text, suie: currentSuie })
  });

  if (res && res.success) {
    document.getElementById('msgSubject').value = '';
    document.getElementById('msgText').value    = '';
    loadMessages();
  }
}

// ── CREATE INVOICE ────────────────────────────────────
async function openNewInvoiceModal() {
  if (!currentSuie) return;
  currentInvoiceNo = null;
  clearAlert('invoiceAlert');
  document.getElementById('invoiceModalTitle').textContent = 'Create Invoice';
  document.getElementById('inv_tax_year').value    = new Date().getFullYear();
  document.getElementById('inv_desc').value        = '';
  document.getElementById('inv_full_amount').value = '';
  document.getElementById('inv_discount').value    = '0';
  document.getElementById('inv_final_amount').value= '';
  document.getElementById('inv_rt_ind').value      = 'No';
  document.getElementById('inv_void_group').style.display = 'none';
  document.getElementById('paymentsTabBtn').style.display = 'none';
  document.getElementById('inv_office_id').innerHTML = '<option value="">-- Select --</option>';

  await loadOffices('inv_office_id');
  switchInvTab('details');
  openModal('invoiceModal');
}

// ── EDIT INVOICE ──────────────────────────────────────
async function openEditInvoiceModal(invoiceNo) {
  if (!currentSuie) return;
  currentInvoiceNo = invoiceNo;
  clearAlert('invoiceAlert');
  document.getElementById('invoiceModalTitle').textContent = `Invoice #${invoiceNo}`;
  document.getElementById('paymentsTabBtn').style.display = '';
  document.getElementById('inv_void_group').style.display = '';

  // Fetch invoices for entity and find this one
  const invoices = await apiFetch(`/api/employee/clients/${currentSuie}/invoices`);
  if (!invoices) return;
  const i = invoices.find(x => x.invoice_no == invoiceNo);
  if (!i) return;

  await loadOffices('inv_office_id');

  document.getElementById('inv_tax_year').value     = i.tax_year        || '';
  document.getElementById('inv_office_id').value    = i.office_id       || '';
  document.getElementById('inv_desc').value         = i.inv_desc        || '';
  document.getElementById('inv_full_amount').value  = i.inv_full_amount || '';
  document.getElementById('inv_discount').value     = i.inv_discount    || '0';
  document.getElementById('inv_final_amount').value = i.inv_final_amount|| '';
  document.getElementById('inv_rt_ind').value       = i.rt_ind          || 'No';
  document.getElementById('inv_void_ind').value     = i.void_ind        || 'N';

  switchInvTab('details');
  openModal('invoiceModal');
}

function switchInvTab(tab) {
  document.querySelectorAll('.inv-tab').forEach(t => t.classList.toggle('active', t.dataset.invTab === tab));
  document.getElementById('invTab-details').style.display  = tab === 'details'  ? '' : 'none';
  document.getElementById('invTab-payments').style.display = tab === 'payments' ? '' : 'none';
  if (tab === 'payments' && currentInvoiceNo) loadPayments();
}

function calcInvFinal() {
  const full     = Number(document.getElementById('inv_full_amount').value) || 0;
  const discount = Number(document.getElementById('inv_discount').value)    || 0;
  document.getElementById('inv_final_amount').value = (full - discount).toFixed(2);
}

async function saveInvoice() {
  clearAlert('invoiceAlert');
  const body = {
    suie:            currentSuie,
    tax_year:        document.getElementById('inv_tax_year').value    || null,
    inv_desc:        document.getElementById('inv_desc').value.trim() || null,
    inv_full_amount: document.getElementById('inv_full_amount').value || 0,
    inv_discount:    document.getElementById('inv_discount').value    || 0,
    office_id:       document.getElementById('inv_office_id').value   || null,
    rt_ind:          document.getElementById('inv_rt_ind').value,
    void_ind:        currentInvoiceNo ? document.getElementById('inv_void_ind').value : 'N'
  };

  const url = currentInvoiceNo
    ? `/api/employee/invoices/${currentInvoiceNo}`
    : '/api/employee/invoices';
  const method = currentInvoiceNo ? 'PUT' : 'POST';

  const res = await apiFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body)
  });

  if (res && res.success) {
    closeModal('invoiceModal');
    // Re-run the last search to refresh the grid
    doSearch();
  }
}

// ── PAYMENTS ─────────────────────────────────────────
async function loadPayments() {
  if (!currentInvoiceNo) return;
  const payments = await apiFetch(`/api/employee/payments/${currentInvoiceNo}`);
  if (!payments) return;

  const tbody = document.getElementById('paymentsBody');
  if (!payments.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="grid-hint">No payments</td></tr>';
    document.getElementById('paymentsSummary').textContent = '';
    return;
  }

  tbody.innerHTML = payments.map(p => `
    <tr>
      <td>${p.pmt_no}</td>
      <td class="num">${fmt$(p.payment_amount)}</td>
      <td>${esc(p.payment_type_desc)}</td>
      <td>${fmtDate(p.payment_date)}</td>
    </tr>
  `).join('');

  const total = payments.reduce((s, p) => s + Number(p.payment_amount), 0);
  document.getElementById('paymentsSummary').textContent = `Total paid: ${fmt$(total)}`;
}

async function openPaymentModal() {
  clearAlert('paymentAlert');
  document.getElementById('pmt_amount').value = '';
  document.getElementById('pmt_type').value   = '';
  await loadPaymentTypeOptions('pmt_type');
  openModal('paymentModal');
}

async function savePayment() {
  clearAlert('paymentAlert');
  const body = {
    invoice_no:     currentInvoiceNo,
    payment_amount: document.getElementById('pmt_amount').value,
    payment_type:   document.getElementById('pmt_type').value
  };
  const res = await apiFetch('/api/employee/payments', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body)
  });
  if (res && res.success) {
    closeModal('paymentModal');
    loadPayments();
    doSearch(); // refresh grid balance
  }
}

// ── UPLOAD ────────────────────────────────────────────
async function openUploadModal() {
  if (!currentSuie) return;
  clearAlert('uploadAlert');
  uploadFile_ = null;
  document.getElementById('uploadFileInput').value = '';
  document.getElementById('uploadDropText').innerHTML = `
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
         style="display:block;margin:0 auto 6px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
         <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
    Click or drag to select a file`;
  document.getElementById('upload_file_type').value = '';
  document.getElementById('upload_tax_year').value  = selectedTaxYear || '';

  await loadFileTypeOptions('upload_file_type');
  openModal('uploadModal');
}

function handleFileSelect(input) {
  if (input.files && input.files[0]) {
    uploadFile_ = input.files[0];
    document.getElementById('uploadDropText').innerHTML =
      `<strong>${esc(uploadFile_.name)}</strong><br><small>${fmtSize(uploadFile_.size)}</small>`;
  }
}

const dropZone = document.getElementById('uploadDropZone');
dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('dragging'); });
dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('dragging'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragging');
  const file = e.dataTransfer.files[0];
  if (file) {
    uploadFile_ = file;
    document.getElementById('uploadDropText').innerHTML =
      `<strong>${esc(file.name)}</strong><br><small>${fmtSize(file.size)}</small>`;
  }
});

async function uploadFile() {
  clearAlert('uploadAlert');
  if (!uploadFile_) { showAlert('uploadAlert', 'Please select a file.'); return; }
  const fileTypeId = document.getElementById('upload_file_type').value;
  if (!fileTypeId)  { showAlert('uploadAlert', 'Please select a file type.'); return; }

  const params = new URLSearchParams({ file_type_id: fileTypeId, filename: uploadFile_.name });
  const taxYear = document.getElementById('upload_tax_year').value;
  if (taxYear) params.set('tax_year', taxYear);

  const btn = document.getElementById('doUploadBtn');
  btn.disabled = true;
  btn.textContent = 'Uploading…';

  const res = await fetch(`/api/employee/upload/${currentSuie}?${params}`, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${empToken}`, 'Content-Type': 'application/octet-stream' },
    body:    uploadFile_
  });

  btn.disabled = false;
  btn.textContent = 'Upload';

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    showAlert('uploadAlert', err.error || 'Upload failed');
    return;
  }

  closeModal('uploadModal');
  loadTaxYears();
  loadFiles();
}

// ── PROFILE ───────────────────────────────────────────
function openProfileModal() {
  clearAlert('profileAlert');
  document.getElementById('profileName').textContent  = empName;
  document.getElementById('prof_current_pw').value    = '';
  document.getElementById('prof_new_pw').value        = '';
  document.getElementById('prof_confirm_pw').value    = '';
  openModal('profileModal');
}

async function changePassword() {
  clearAlert('profileAlert');
  const current = document.getElementById('prof_current_pw').value;
  const newPw   = document.getElementById('prof_new_pw').value;
  const confirm = document.getElementById('prof_confirm_pw').value;

  if (!current || !newPw) { showAlert('profileAlert', 'Both passwords are required.'); return; }
  if (newPw !== confirm)  { showAlert('profileAlert', 'New passwords do not match.'); return; }

  const res = await apiFetch('/api/employee/profile/password', {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ current_password: current, new_password: newPw })
  });

  if (res && res.success) {
    showAlert('profileAlert', 'Password updated.', 'success');
    document.getElementById('prof_current_pw').value = '';
    document.getElementById('prof_new_pw').value     = '';
    document.getElementById('prof_confirm_pw').value = '';
  }
}

// ── LOOKUPS ───────────────────────────────────────────
const _cache = {};

async function loadOffices(selectId) {
  if (!_cache.offices) _cache.offices = await apiFetch('/api/employee/offices');
  const sel = document.getElementById(selectId);
  const cur = sel.value;
  sel.innerHTML = '<option value="">-- Select --</option>' +
    (_cache.offices || []).map(o => `<option value="${o.office_id}">${esc(o.office_desc)}</option>`).join('');
  if (cur) sel.value = cur;
}

async function loadFileTypeOptions(selectId) {
  if (!_cache.fileTypes) _cache.fileTypes = await apiFetch('/api/employee/file-types');
  const sel = document.getElementById(selectId);
  sel.innerHTML = '<option value="">-- Select --</option>' +
    (_cache.fileTypes || []).map(ft => `<option value="${ft.file_type_id}">${esc(ft.file_type_desc)}</option>`).join('');
}

async function loadPaymentTypeOptions(selectId) {
  if (!_cache.paymentTypes) _cache.paymentTypes = await apiFetch('/api/employee/payment-types');
  const sel = document.getElementById(selectId);
  sel.innerHTML = '<option value="">-- Select --</option>' +
    (_cache.paymentTypes || []).map(pt => `<option value="${pt.payment_type_id}">${esc(pt.payment_type_desc)}</option>`).join('');
}

// ── INIT: populate search dropdowns on load ────────────
async function initSearchDropdowns() {
  // Preparers
  const preparers = await apiFetch('/api/employee/preparers');
  if (preparers) {
    const sel = document.getElementById('f_preparer');
    sel.innerHTML = '<option value="">All</option>' +
      preparers.map(p => `<option value="${p.emp_id}">${esc(p.name)}</option>`).join('');
  }

  // Offices — reuse cached offices endpoint
  if (!_cache.offices) _cache.offices = await apiFetch('/api/employee/offices');
  if (_cache.offices) {
    const sel = document.getElementById('f_office');
    sel.innerHTML = '<option value="">All</option>' +
      _cache.offices.map(o => `<option value="${o.office_id}">${esc(o.office_desc)}</option>`).join('');
  }
}

initSearchDropdowns();
