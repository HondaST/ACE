const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const { sql, getPool } = require('../db');
const auth    = require('../middleware/auth');

router.use(auth);

// Section 1 — Client info from People table
router.get('/info', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('sui', sql.Int, req.user.sui)
      .query(`
        SELECT sui,
               first_name + ' ' + last_name AS full_name,
               cell,
               email
        FROM   people
        WHERE  sui = @sui
      `);
    res.json(result.recordset[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Section 3 — All tax entities for this client
router.get('/entities', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('sui', sql.Int, req.user.sui)
      .query(`
        SELECT tax_entity      = CASE WHEN p.first_name IS NULL THEN entityname
                                      ELSE p.first_name + ' ' + p.last_name END,
               tax_type        = et_desc,
               tax_professional = e.first_name + ' ' + e.last_name,
               p.suie,
               p.assigned_prep,
               p.cell,
               p.email
        FROM   people_entity p
        LEFT JOIN entity_type et ON p.entity_type = et.et_id
        LEFT JOIN employee    e  ON p.assigned_prep = e.emp_id
        WHERE  p.sui = @sui
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Single entity detail — for edit mode
router.get('/entities/:suie', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('sui',  sql.Int,        req.user.sui)
      .input('suie', sql.NVarChar(50), req.params.suie)
      .query(`
        SELECT p.suie, p.entity_type, p.taxidnumber,
               p.first_name, p.last_name, p.entityname,
               p.street, p.city, p.state, p.zipcode,
               p.cell, p.email, p.assigned_prep, p.created_date
        FROM   people_entity p
        WHERE  p.sui = @sui AND p.suie = @suie
      `);
    if (!result.recordset.length) return res.status(404).json({ error: 'Entity not found' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update an existing tax entity
router.put('/entities/:suie', async (req, res) => {
  try {
    const {
      entity_type, taxidnumber,
      first_name, last_name, entity_name,
      street, city, state, zipcode,
      cell, email, assigned_prep
    } = req.body;

    const isPersonal = entity_type === 'PERS';

    if (!entity_type)                                return res.status(400).json({ error: 'Entity type is required' });
    if (isPersonal && (!first_name || !last_name))   return res.status(400).json({ error: 'First Name and Last Name are required' });
    if (!isPersonal && !entity_name)                 return res.status(400).json({ error: 'Entity Name is required' });
    if (!street || !city || !state || !zipcode)
      return res.status(400).json({ error: 'Street, City, State, and Zipcode are required' });

    const entityname = isPersonal ? `${last_name}, ${first_name}` : entity_name;

    const pool = await getPool();
    await pool.request()
      .input('sui',           sql.Int,           req.user.sui)
      .input('suie',          sql.NVarChar(50),  req.params.suie)
      .input('entity_type',   sql.NVarChar(50),  entity_type)
      .input('taxidnumber',   sql.NVarChar(50),  taxidnumber  || null)
      .input('first_name',    sql.NVarChar(100), first_name   || null)
      .input('last_name',     sql.NVarChar(100), last_name    || null)
      .input('entityname',    sql.NVarChar(200), entityname)
      .input('street',        sql.NVarChar(200), street)
      .input('city',          sql.NVarChar(100), city)
      .input('state',         sql.NVarChar(2),   state.toUpperCase())
      .input('zipcode',       sql.NVarChar(20),  zipcode)
      .input('cell',          sql.NVarChar(50),  cell)
      .input('email',         sql.NVarChar(200), email)
      .input('assigned_prep', sql.NVarChar(50),  assigned_prep ? String(assigned_prep) : null)
      .query(`
        UPDATE people_entity
        SET    entity_type   = @entity_type,
               taxidnumber   = @taxidnumber,
               first_name    = @first_name,
               last_name     = @last_name,
               entityname    = @entityname,
               street        = @street,
               city          = @city,
               state         = @state,
               zipcode       = @zipcode,
               cell          = @cell,
               email         = @email,
               assigned_prep = @assigned_prep
        WHERE  sui = @sui AND suie = @suie
      `);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Section 4 — Distinct tax years for a given entity
router.get('/entities/:suie/tax-years', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('suie', sql.NVarChar(50), req.params.suie)
      .query(`
        SELECT DISTINCT file_info.tax_year
        FROM   file_info
        WHERE  file_info.suie = @suie
        ORDER BY file_info.tax_year DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Section 5 — Files for a given entity, optionally filtered by tax year
router.get('/entities/:suie/files', async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request()
      .input('suie', sql.NVarChar(50), req.params.suie);

    let query = `
      SELECT fi.file_info_id,
             fi.suie,
             fi.tax_year,
             fi.file_type_id,
             fi.file_info_name,
             fi.file_notes,
             fi.file_size,
             fi.created_dt
      FROM   file_info fi
      WHERE  fi.suie = @suie
    `;

    if (req.query.year) {
      request.input('year', sql.Int, parseInt(req.query.year));
      query += ' AND fi.tax_year = @year';
    }

    query += ' ORDER BY fi.created_dt DESC';

    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// File type lookup — dropdown choices for upload
router.get('/file-types', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`
        SELECT file_type_id,
               file_type_desc
        FROM   file_type
        ORDER BY file_type_desc
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Section 5b — Open / serve a file by file_info_id
router.get('/files/:fileInfoId/open', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('fileInfoId', sql.Int, parseInt(req.params.fileInfoId))
      .input('sui',        sql.Int, req.user.sui)
      .query(`
        SELECT fi.file_info_id,
               fi.file_info_name,
               fi.suie,
               pe.sui
        FROM   file_info     fi
        JOIN   people_entity pe ON fi.suie = pe.suie
        WHERE  fi.file_info_id = @fileInfoId
          AND  pe.sui          = @sui
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ error: 'File not found' });
    }

    const f        = result.recordset[0];
    const fileName = `${f.file_info_id}-${f.file_info_name}`;
    const filePath = path.join(
      'C:\\projects\\ace\\repository',
      String(f.sui),
      String(f.suie),
      fileName
    );

    res.sendFile(filePath);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Section 5c — Upload a file for a given entity / tax year
//   File bytes arrive as application/octet-stream in req.body (Buffer).
//   All metadata (suie, file_type_id, tax_year, filename) travel in the URL.
const rawBody = express.raw({ type: '*/*', limit: '100mb' });

router.post('/upload/:suie', rawBody, async (req, res) => {
  try {
    const suie         = req.params.suie;
    const file_type_id = req.query.file_type_id;
    const tax_year     = req.query.tax_year;
    const filename     = req.query.filename;
    const fileBuffer   = req.body; // Buffer from express.raw()

    if (!suie || !file_type_id || !filename || !Buffer.isBuffer(fileBuffer) || !fileBuffer.length) {
      return res.status(400).json({ error: 'suie, file_type_id, filename, and file body are required' });
    }

    const pool = await getPool();

    // Validate suie belongs to the logged-in user and retrieve sui
    const entityCheck = await pool.request()
      .input('suie', sql.NVarChar(50), suie)
      .input('sui',  sql.Int,          req.user.sui)
      .query(`
        SELECT sui
        FROM   people_entity
        WHERE  suie = @suie
          AND  sui  = @sui
      `);

    if (!entityCheck.recordset.length) {
      return res.status(403).json({ error: 'Entity not found or access denied' });
    }

    const sui = entityCheck.recordset[0].sui;

    // Insert file_info row and capture the new file_info_id
    const insertResult = await pool.request()
      .input('suie',           sql.NVarChar(50),      suie)
      .input('tax_year',       sql.Int,               tax_year ? parseInt(tax_year) : null)
      .input('file_type_id',   sql.NVarChar(50),      file_type_id)
      .input('file_info_name', sql.NVarChar(500),     filename)
      .input('file_size',      sql.Int,               fileBuffer.length)
      .query(`
        INSERT INTO file_info (suie, tax_year, file_type_id, file_info_name, file_size, created_dt)
        OUTPUT INSERTED.file_info_id
        VALUES (@suie, @tax_year, @file_type_id, @file_info_name, @file_size, GETDATE())
      `);

    const fileInfoId = insertResult.recordset[0].file_info_id;

    // Ensure the destination directory exists then write the file
    const dir      = path.join('C:\\projects\\ace\\repository', String(sui), String(suie));
    const destPath = path.join(dir, `${fileInfoId}-${filename}`);

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(destPath, fileBuffer);

    res.json({ success: true, file_info_id: fileInfoId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Section 6 — Chat messages for a given entity
router.get('/entities/:suie/messages', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('suie', sql.NVarChar(50), req.params.suie)
      .query(`
        SELECT msg_id,
               msg_subject,
               msg_text,
               to_person   = CASE
                 WHEN sent_by_id = 'C' THEN (SELECT first_name + ' ' + last_name FROM employee WHERE emp_id = to_id)
                 WHEN sent_by_id = 'E' THEN (SELECT CASE WHEN (first_name IS NULL OR first_name = '') THEN entityname ELSE first_name + ' ' + last_name END FROM people_entity WHERE suie = to_id)
                 ELSE 'System Admin'
               END,
               from_person = CASE
                 WHEN sent_by_id = 'C' THEN (SELECT CASE WHEN (first_name IS NULL OR first_name = '') THEN entityname ELSE first_name + ' ' + last_name END FROM people_entity WHERE suie = from_id)
                 WHEN sent_by_id = 'E' THEN (SELECT first_name + ' ' + last_name FROM employee WHERE emp_id = from_id)
                 ELSE 'System Admin'
               END,
               sent_by_id,
               to_id,
               from_id,
               msg_create_dt,
               suie
        FROM   msg_queue
        WHERE  suie = @suie
        ORDER BY msg_create_dt ASC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Invoices — all invoices for a given tax entity
router.get('/invoices/:suie', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('suie', sql.NVarChar(50), String(req.params.suie))
      .query(`
        SELECT i.invoice_no,
               i.tax_year,
               i.inv_desc,
               i.inv_full_amount,
               i.inv_discount,
               i.inv_final_amount,
               bal_due      = i.inv_final_amount
                              - (SELECT ISNULL(SUM(payment_amount), 0)
                                 FROM payment WHERE invoice_no = i.invoice_no),
               i.inv_date,
               client_name  = CASE
                 WHEN pe.first_name IS NULL OR pe.first_name = '' THEN pe.entityname
                 ELSE pe.last_name + ' ' + pe.first_name
               END,
               prep         = e.last_name + ', ' + e.first_name,
               pe.sui,
               entityname   = CASE
                 WHEN entity_type = 'PERS' THEN pe.last_name + ', ' + pe.first_name
                 ELSE pe.entityname
               END,
               pe.taxidnumber,
               pe.entity_type,
               e.emp_id,
               pe.suie,
               p.email,
               client_email = CASE
                 WHEN pe.email IS NULL OR pe.email = '' THEN p.email
                 ELSE pe.email
               END,
               client_cell  = CASE
                 WHEN pe.cell IS NULL OR pe.cell = '' THEN p.cell
                 ELSE pe.cell
               END
        FROM   people_entity pe
        LEFT JOIN invoice  i  ON pe.suie = i.suie
        LEFT JOIN employee e  ON i.emp_id = e.emp_id
        JOIN       people  p  ON p.sui = pe.sui
        WHERE  pe.suie = @suie
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Full invoice detail for the edit screen
router.get('/invoice-detail/:invoice_no', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('invoice_no', sql.Int, parseInt(req.params.invoice_no))
      .query(`
        SELECT   i.invoice_no,
                 i.suie,
                 pe.sui,
                 i.emp_id,
                 i.tax_year,
                 i.inv_desc,
                 i.inv_full_amount,
                 i.inv_discount,
                 i.inv_final_amount,
                 i.inv_date,
                 i.void_ind,
                 entityname = case pe.entity_type when 'PERS' then pe.first_name + ' ' + pe.last_name else pe.entityname end,
                 prep = e.last_name + ', ' + e.first_name,
                 pe.street,
                 pe.city,
                 pe.state,
                 pe.zipcode,
                 p.first_name,
                 p.last_name,
                 p.cell,
                 p.email,
                 entity_cell = isnull(pe.cell,''),
                 entity_email = isnull(pe.email,''),
                 i.office_id,
                 i.rt_ind
        FROM invoice i join employee e on i.emp_id = e.emp_id
             join people_entity pe on i.suie = pe.suie
             join people p on pe.sui = p.sui
        WHERE i.invoice_no = @invoice_no
      `);
    if (!result.recordset.length) return res.status(404).json({ error: 'Invoice not found' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Offices for the ERO associated with an employee
router.get('/offices-by-employee/:emp_id', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('emp_id', sql.NVarChar(50), req.params.emp_id)
      .query(`
        SELECT o.office_id, o.office_desc
        FROM   employee e
        JOIN   offices  o ON o.ero_id = e.ero_id
        WHERE  e.emp_id = @emp_id
        ORDER BY o.office_desc
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update an invoice
router.put('/invoices/:invoice_no', async (req, res) => {
  try {
    const { tax_year, inv_desc, inv_full_amount, inv_discount, office_id, rt } = req.body;
    const inv_final_amount = (Number(inv_full_amount) || 0) - (Number(inv_discount) || 0);

    const pool = await getPool();
    await pool.request()
      .input('invoice_no',       sql.Int,          parseInt(req.params.invoice_no))
      .input('tax_year',         sql.Int,           parseInt(tax_year))
      .input('inv_desc',         sql.NVarChar(200), inv_desc || null)
      .input('inv_full_amount',  sql.Decimal(10,2), Number(inv_full_amount) || 0)
      .input('inv_discount',     sql.Decimal(10,2), Number(inv_discount)    || 0)
      .input('inv_final_amount', sql.Decimal(10,2), inv_final_amount)
      .input('office_id',        sql.NVarChar(50),  office_id || null)
      .input('rt',               sql.NVarChar(3),   rt || 'No')
      .query(`
        UPDATE invoice
        SET    tax_year         = @tax_year,
               inv_desc         = @inv_desc,
               inv_full_amount  = @inv_full_amount,
               inv_discount     = @inv_discount,
               inv_final_amount = @inv_final_amount,
               office_id        = @office_id,
               rt               = @rt
        WHERE  invoice_no = @invoice_no
      `);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Section 7 — Send a message
router.post('/messages', async (req, res) => {
  try {
    const { subject, text, suie, to_id } = req.body;
    if (!subject || !text || !suie || !to_id) {
      return res.status(400).json({ error: 'subject, text, suie, and to_id are required' });
    }

    const pool = await getPool();
    await pool.request()
      .input('subject',  sql.NVarChar(500),    subject)
      .input('text',     sql.NVarChar(sql.MAX), text)
      .input('suie',     sql.NVarChar(50),      String(suie))
      .input('to_id',    sql.NVarChar(50),      String(to_id))
      .input('from_id',  sql.NVarChar(50),      String(suie))
      .query(`
        INSERT INTO msg_queue (msg_subject, msg_text, sent_by_id, to_id, from_id, msg_create_dt, suie)
        VALUES (@subject, @text, 'C', @to_id, @from_id, GETDATE(), @suie)
      `);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Entity types lookup — populates the Entity Type dropdown
router.get('/entity-types', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT et_id, et_desc FROM entity_type ORDER BY et_desc`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Preparers lookup — populates the Assigned Prep dropdown
router.get('/preparers', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT emp_id, first_name, last_name FROM employee ORDER BY last_name, first_name`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check whether a tax ID number is already in use
// PERS entity_type checks only against other PERS entities
// All other types check against all non-PERS entities
router.get('/check-taxid', async (req, res) => {
  try {
    const { taxidnumber, entity_type, exclude_suie } = req.query;
    if (!taxidnumber || !taxidnumber.trim()) return res.json({ inUse: false });

    const isPersonal = entity_type === 'PERS';
    const pool = await getPool();
    const dbRequest = pool.request()
      .input('taxidnumber', sql.NVarChar(50), taxidnumber.trim());

    let query = `SELECT COUNT(*) AS cnt FROM people_entity WHERE taxidnumber = @taxidnumber`;
    query += isPersonal ? ` AND entity_type = 'PERS'` : ` AND entity_type != 'PERS'`;

    if (exclude_suie) {
      dbRequest.input('exclude_suie', sql.NVarChar(50), exclude_suie);
      query += ` AND suie != @exclude_suie`;
    }

    const result = await dbRequest.query(query);
    res.json({ inUse: result.recordset[0].cnt > 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new tax entity for the logged-in client
router.post('/entities', async (req, res) => {
  try {
    const {
      entity_type, taxidnumber,
      first_name, last_name, entity_name,
      street, city, state, zipcode,
      cell, email, assigned_prep
    } = req.body;

    const isPersonal = entity_type === 'PERS';

    // Server-side required-field validation
    if (!entity_type)                           return res.status(400).json({ error: 'Entity type is required' });
    if (isPersonal && (!first_name || !last_name)) return res.status(400).json({ error: 'First Name and Last Name are required' });
    if (!isPersonal && !entity_name)            return res.status(400).json({ error: 'Entity Name is required' });
    if (!street || !city || !state || !zipcode)
      return res.status(400).json({ error: 'Street, City, State, and Zipcode are required' });

    // entityname stored in DB: "Last, First" for personal; entity_name for others
    const entityname = isPersonal
      ? `${last_name}, ${first_name}`
      : entity_name;

    const pool = await getPool();
    const result = await pool.request()
      .input('sui',           sql.Int,           req.user.sui)
      .input('entity_type',   sql.NVarChar(50),  entity_type)
      .input('taxidnumber',   sql.NVarChar(50),  taxidnumber  || null)
      .input('first_name',    sql.NVarChar(100), first_name   || null)
      .input('last_name',     sql.NVarChar(100), last_name    || null)
      .input('entityname',    sql.NVarChar(200), entityname)
      .input('street',        sql.NVarChar(200), street)
      .input('city',          sql.NVarChar(100), city)
      .input('state',         sql.NVarChar(2),   state.toUpperCase())
      .input('zipcode',       sql.NVarChar(20),  zipcode)
      .input('cell',          sql.NVarChar(50),  cell)
      .input('email',         sql.NVarChar(200), email)
      .input('assigned_prep', sql.NVarChar(50),  assigned_prep ? String(assigned_prep) : null)
      .query(`
        INSERT INTO people_entity
          (sui, entity_type, taxidnumber, first_name, last_name, entityname,
           street, city, state, zipcode, cell, email, assigned_prep, created_date)
        OUTPUT INSERTED.suie
        VALUES
          (@sui, @entity_type, @taxidnumber, @first_name, @last_name, @entityname,
           @street, @city, @state, @zipcode, @cell, @email, @assigned_prep, GETDATE())
      `);

    res.json({ success: true, suie: result.recordset[0].suie });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Payment types lookup
router.get('/payment-types', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT payment_type_id, payment_type_desc FROM payment_type ORDER BY payment_type_desc`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Payments for an invoice
router.get('/payments/:invoice_no', async (req, res) => {
  try {
    const pool = await getPool();
    const invoiceNo = parseInt(req.params.invoice_no);
    console.log(`[payments GET] invoice_no=${invoiceNo}`);
    const result = await pool.request()
      .input('invoice_no', sql.Int, invoiceNo)
      .query(`
        SELECT p.sequence_no                        AS pmt_no,
               p.payment_amount,
               ISNULL(pt.payment_type_desc, p.payment_type_id) AS payment_type_id,
               p.payment_date
        FROM   payment      p
        LEFT JOIN payment_type pt ON pt.payment_type_id = p.payment_type_id
        WHERE  p.invoice_no = @invoice_no
        ORDER BY p.sequence_no ASC
      `);
    console.log(`[payments GET] returned ${result.recordset.length} rows`);
    res.json(result.recordset);
  } catch (err) {
    console.error('[payments GET] ERROR:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Record a payment
router.post('/payments', async (req, res) => {
  try {
    const { invoice_no, payment_amount, payment_type } = req.body;
    console.log(`[payments POST] invoice_no=${invoice_no}, amount=${payment_amount}, type=${payment_type}`);
    if (!invoice_no || !payment_amount || !payment_type)
      return res.status(400).json({ error: 'invoice_no, payment_amount, and payment_type are required' });

    const pool = await getPool();
    await pool.request()
      .input('invoice_no',      sql.Int,          parseInt(invoice_no))
      .input('payment_amount',  sql.Decimal(10,2), Number(payment_amount))
      .input('payment_type_id', sql.NVarChar(50),  String(payment_type))
      .query(`
        INSERT INTO payment (invoice_no, sequence_no, payment_amount, payment_type_id, payment_date)
        VALUES (
          @invoice_no,
          (SELECT ISNULL(MAX(sequence_no), 0) + 1 FROM payment WHERE invoice_no = @invoice_no),
          @payment_amount,
          @payment_type_id,
          GETDATE()
        )
      `);
    console.log(`[payments POST] INSERT succeeded`);
    res.json({ success: true });
  } catch (err) {
    console.error('[payments POST] ERROR:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
