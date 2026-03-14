const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const bcrypt  = require('bcrypt');
const { sql, getPool } = require('../db');
const auth    = require('../middleware/auth');

router.use(auth);

// Normalize emp_id to string (DB may return integer; NVarChar params require string)
router.use((req, res, next) => {
  if (req.user && req.user.emp_id != null) req.user.emp_id = String(req.user.emp_id);
  next();
});

// ── Employee Info ─────────────────────────────────────────────

router.get('/info', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('emp_id', sql.NVarChar(50), req.user.emp_id)
      .query(`
        SELECT emp_id,
               first_name + ' ' + last_name AS full_name,
               first_name,
               last_name
        FROM   employee
        WHERE  emp_id = @emp_id
      `);
    res.json(result.recordset[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Search (Section 1 + 3) ────────────────────────────────────
// Returns all people_entity rows assigned to this employee that match filters,
// LEFT JOINed with invoices (so entities with no invoices still appear).

router.get('/search', async (req, res) => {
  try {
    const { client, tax_id, invoice_no, tax_year, email, date_from, date_to, cell, balance_due, preparer, office_id } = req.query;

    const pool    = await getPool();
    const request = pool.request().input('emp_id', sql.NVarChar(50), req.user.emp_id);

    let where = `pe.assigned_prep = @emp_id`;

    if (client) {
      request.input('client', sql.NVarChar(200), `%${client}%`);
      where += ` AND (pe.entityname LIKE @client OR pe.first_name + ' ' + pe.last_name LIKE @client)`;
    }
    if (tax_id) {
      request.input('tax_id', sql.NVarChar(50), `%${tax_id}%`);
      where += ` AND pe.taxidnumber LIKE @tax_id`;
    }
    if (invoice_no) {
      request.input('invoice_no', sql.Int, parseInt(invoice_no));
      where += ` AND i.invoice_no = @invoice_no`;
    }
    if (tax_year) {
      request.input('tax_year', sql.Int, parseInt(tax_year));
      where += ` AND i.tax_year = @tax_year`;
    }
    if (email) {
      request.input('email', sql.NVarChar(255), `%${email}%`);
      where += ` AND (pe.email LIKE @email OR p.email LIKE @email)`;
    }
    if (date_from) {
      request.input('date_from', sql.Date, date_from);
      where += ` AND i.inv_date >= @date_from`;
    }
    if (date_to) {
      request.input('date_to', sql.Date, date_to);
      where += ` AND i.inv_date <= @date_to`;
    }
    if (cell) {
      request.input('cell', sql.NVarChar(50), `%${cell}%`);
      where += ` AND (pe.cell LIKE @cell OR p.cell LIKE @cell)`;
    }
    if (preparer) {
      request.input('preparer', sql.NVarChar(50), preparer);
      where += ` AND pe.assigned_prep = @preparer`;
    }
    if (office_id) {
      request.input('office_id', sql.NVarChar(50), office_id);
      where += ` AND i.office_id = @office_id`;
    }
    if (balance_due === 'true') {
      where += ` AND (i.inv_final_amount - ISNULL((SELECT SUM(payment_amount) FROM payment WHERE invoice_no = i.invoice_no), 0)) > 0`;
    }

    const result = await request.query(`
      SELECT pe.suie,
             pe.sui,
             pe.entity_type,
             pe.taxidnumber,
             display_name = CASE
               WHEN pe.entity_type = 'PERS' THEN pe.last_name + ', ' + pe.first_name
               ELSE pe.entityname
             END,
             type_desc    = et.et_desc,
             pe.street, pe.city, pe.state, pe.zipcode,
             pe.cell      AS entity_cell,
             pe.email     AS entity_email,
             pe.assigned_prep,
             pe.created_date,
             -- Invoice columns (NULL when no invoice)
             i.invoice_no,
             i.tax_year,
             i.inv_desc,
             i.inv_full_amount,
             i.inv_discount,
             i.inv_final_amount,
             i.inv_date,
             i.void_ind,
             i.rt_ind,
             i.office_id,
             bal_due = CASE WHEN i.invoice_no IS NULL THEN NULL
                            ELSE i.inv_final_amount
                              - ISNULL((SELECT SUM(payment_amount) FROM payment WHERE invoice_no = i.invoice_no), 0)
                       END,
             prep_name = CASE WHEN e2.emp_id IS NULL THEN NULL
                              ELSE e2.last_name + ', ' + e2.first_name
                         END,
             -- Account owner info (Section 2)
             owner_name  = p.first_name + ' ' + p.last_name,
             owner_cell  = p.cell,
             owner_email = p.email,
             owner_sui   = p.sui
      FROM   people_entity pe
      LEFT JOIN entity_type et ON pe.entity_type = et.et_id
      LEFT JOIN invoice     i  ON pe.suie = i.suie
      LEFT JOIN employee    e2 ON i.emp_id = e2.emp_id
      LEFT JOIN people      p  ON pe.sui   = p.sui
      WHERE  ${where}
      ORDER BY display_name ASC, i.inv_date DESC
    `);

    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Preparers list (for search dropdown)
router.get('/preparers', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT emp_id, first_name + ' ' + last_name AS name FROM employee ORDER BY last_name, first_name`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Clients (entities assigned to this employee) ──────────────

// All entities assigned to this employee
router.get('/clients', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('emp_id', sql.NVarChar(50), req.user.emp_id)
      .query(`
        SELECT pe.suie,
               pe.sui,
               pe.entity_type,
               pe.taxidnumber,
               pe.first_name,
               pe.last_name,
               pe.entityname,
               pe.street,
               pe.city,
               pe.state,
               pe.zipcode,
               pe.cell,
               pe.email,
               pe.assigned_prep,
               pe.created_date,
               display_name = CASE
                 WHEN pe.entity_type = 'PERS' THEN pe.last_name + ', ' + pe.first_name
                 ELSE pe.entityname
               END,
               type_desc    = et.et_desc,
               client_cell  = ISNULL(NULLIF(pe.cell,''), p.cell),
               client_email = ISNULL(NULLIF(pe.email,''), p.email),
               p.first_name AS owner_first,
               p.last_name  AS owner_last
        FROM   people_entity pe
        LEFT JOIN entity_type et ON pe.entity_type = et.et_id
        LEFT JOIN people      p  ON pe.sui = p.sui
        WHERE  pe.assigned_prep = @emp_id
        ORDER BY display_name
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Single entity detail
router.get('/clients/:suie', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('emp_id', sql.NVarChar(50), req.user.emp_id)
      .input('suie',   sql.NVarChar(50), req.params.suie)
      .query(`
        SELECT pe.suie,
               pe.sui,
               pe.entity_type,
               pe.taxidnumber,
               pe.first_name,
               pe.last_name,
               pe.entityname,
               pe.street,
               pe.city,
               pe.state,
               pe.zipcode,
               pe.cell,
               pe.email,
               pe.assigned_prep,
               pe.created_date,
               display_name = CASE
                 WHEN pe.entity_type = 'PERS' THEN pe.last_name + ', ' + pe.first_name
                 ELSE pe.entityname
               END,
               type_desc    = et.et_desc,
               client_cell  = ISNULL(NULLIF(pe.cell,''), p.cell),
               client_email = ISNULL(NULLIF(pe.email,''), p.email),
               p.first_name AS owner_first,
               p.last_name  AS owner_last
        FROM   people_entity pe
        LEFT JOIN entity_type et ON pe.entity_type = et.et_id
        LEFT JOIN people      p  ON pe.sui = p.sui
        WHERE  pe.suie = @suie
          AND  pe.assigned_prep = @emp_id
      `);
    if (!result.recordset.length) return res.status(404).json({ error: 'Client not found' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update entity info
router.put('/clients/:suie', async (req, res) => {
  try {
    const {
      entity_type, taxidnumber,
      first_name, last_name, entity_name,
      street, city, state, zipcode,
      cell, email
    } = req.body;

    const isPersonal = entity_type === 'PERS';
    if (!entity_type) return res.status(400).json({ error: 'Entity type is required' });
    if (isPersonal && (!first_name || !last_name)) return res.status(400).json({ error: 'First and Last Name are required' });
    if (!isPersonal && !entity_name) return res.status(400).json({ error: 'Entity Name is required' });
    if (!street || !city || !state || !zipcode) return res.status(400).json({ error: 'Address is required' });

    const entityname = isPersonal ? `${last_name}, ${first_name}` : entity_name;

    const pool = await getPool();
    await pool.request()
      .input('emp_id',      sql.NVarChar(50),  req.user.emp_id)
      .input('suie',        sql.NVarChar(50),  req.params.suie)
      .input('entity_type', sql.NVarChar(50),  entity_type)
      .input('taxidnumber', sql.NVarChar(50),  taxidnumber  || null)
      .input('first_name',  sql.NVarChar(100), first_name   || null)
      .input('last_name',   sql.NVarChar(100), last_name    || null)
      .input('entityname',  sql.NVarChar(200), entityname)
      .input('street',      sql.NVarChar(200), street)
      .input('city',        sql.NVarChar(100), city)
      .input('state',       sql.NVarChar(2),   state.toUpperCase())
      .input('zipcode',     sql.NVarChar(20),  zipcode)
      .input('cell',        sql.NVarChar(50),  cell  || null)
      .input('email',       sql.NVarChar(200), email || null)
      .query(`
        UPDATE people_entity
        SET    entity_type = @entity_type,
               taxidnumber = @taxidnumber,
               first_name  = @first_name,
               last_name   = @last_name,
               entityname  = @entityname,
               street      = @street,
               city        = @city,
               state       = @state,
               zipcode     = @zipcode,
               cell        = @cell,
               email       = @email
        WHERE  suie = @suie
          AND  assigned_prep = @emp_id
      `);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Invoices ──────────────────────────────────────────────────

// All invoices for an entity
router.get('/clients/:suie/invoices', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('suie',   sql.NVarChar(50), req.params.suie)
      .input('emp_id', sql.NVarChar(50), req.user.emp_id)
      .query(`
        SELECT i.invoice_no,
               i.tax_year,
               i.inv_desc,
               i.inv_full_amount,
               i.inv_discount,
               i.inv_final_amount,
               bal_due     = i.inv_final_amount
                             - (SELECT ISNULL(SUM(payment_amount), 0)
                                FROM payment WHERE invoice_no = i.invoice_no),
               i.inv_date,
               i.void_ind,
               i.rt_ind,
               i.office_id,
               i.emp_id,
               prep        = e.last_name + ', ' + e.first_name
        FROM   invoice  i
        LEFT JOIN employee e ON i.emp_id = e.emp_id
        WHERE  i.suie = @suie
        ORDER BY i.inv_date DESC, i.invoice_no DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new invoice
router.post('/invoices', async (req, res) => {
  try {
    const { suie, tax_year, inv_desc, inv_full_amount, inv_discount, office_id, rt_ind } = req.body;
    if (!suie) return res.status(400).json({ error: 'suie is required' });

    const inv_final_amount = (Number(inv_full_amount) || 0) - (Number(inv_discount) || 0);

    const pool = await getPool();

    // Verify entity is assigned to this employee
    const check = await pool.request()
      .input('suie',   sql.NVarChar(50), suie)
      .input('emp_id', sql.NVarChar(50), req.user.emp_id)
      .query(`SELECT 1 AS ok FROM people_entity WHERE suie = @suie AND assigned_prep = @emp_id`);
    if (!check.recordset.length) return res.status(403).json({ error: 'Access denied' });

    const result = await pool.request()
      .input('suie',             sql.NVarChar(50),  suie)
      .input('emp_id',           sql.NVarChar(50),  req.user.emp_id)
      .input('tax_year',         sql.Int,            tax_year ? parseInt(tax_year) : null)
      .input('inv_desc',         sql.NVarChar(200),  inv_desc || null)
      .input('inv_full_amount',  sql.Decimal(10,2),  Number(inv_full_amount)  || 0)
      .input('inv_discount',     sql.Decimal(10,2),  Number(inv_discount)     || 0)
      .input('inv_final_amount', sql.Decimal(10,2),  inv_final_amount)
      .input('office_id',        sql.NVarChar(50),   office_id || null)
      .input('rt_ind',           sql.NVarChar(3),    rt_ind || 'No')
      .query(`
        INSERT INTO invoice
          (suie, emp_id, tax_year, inv_desc, inv_full_amount, inv_discount,
           inv_final_amount, office_id, rt_ind, inv_date, void_ind)
        OUTPUT INSERTED.invoice_no
        VALUES
          (@suie, @emp_id, @tax_year, @inv_desc, @inv_full_amount, @inv_discount,
           @inv_final_amount, @office_id, @rt_ind, GETDATE(), 'N')
      `);
    res.json({ success: true, invoice_no: result.recordset[0].invoice_no });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update an invoice
router.put('/invoices/:invoice_no', async (req, res) => {
  try {
    const { tax_year, inv_desc, inv_full_amount, inv_discount, office_id, rt_ind, void_ind } = req.body;
    const inv_final_amount = (Number(inv_full_amount) || 0) - (Number(inv_discount) || 0);

    const pool = await getPool();
    await pool.request()
      .input('invoice_no',       sql.Int,           parseInt(req.params.invoice_no))
      .input('emp_id',           sql.NVarChar(50),  req.user.emp_id)
      .input('tax_year',         sql.Int,            tax_year ? parseInt(tax_year) : null)
      .input('inv_desc',         sql.NVarChar(200),  inv_desc || null)
      .input('inv_full_amount',  sql.Decimal(10,2),  Number(inv_full_amount)  || 0)
      .input('inv_discount',     sql.Decimal(10,2),  Number(inv_discount)     || 0)
      .input('inv_final_amount', sql.Decimal(10,2),  inv_final_amount)
      .input('office_id',        sql.NVarChar(50),   office_id || null)
      .input('rt_ind',           sql.NVarChar(3),    rt_ind || 'No')
      .input('void_ind',         sql.NVarChar(1),    void_ind || 'N')
      .query(`
        UPDATE invoice
        SET    tax_year         = @tax_year,
               inv_desc         = @inv_desc,
               inv_full_amount  = @inv_full_amount,
               inv_discount     = @inv_discount,
               inv_final_amount = @inv_final_amount,
               office_id        = @office_id,
               rt_ind           = @rt_ind,
               void_ind         = @void_ind
        WHERE  invoice_no = @invoice_no
          AND  emp_id     = @emp_id
      `);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Payments for an invoice
router.get('/payments/:invoice_no', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('invoice_no', sql.Int, parseInt(req.params.invoice_no))
      .query(`
        SELECT p.sequence_no AS pmt_no,
               p.payment_amount,
               ISNULL(pt.payment_type_desc, p.payment_type_id) AS payment_type_desc,
               p.payment_date
        FROM   payment p
        LEFT JOIN payment_type pt ON pt.payment_type_id = p.payment_type_id
        WHERE  p.invoice_no = @invoice_no
        ORDER BY p.sequence_no ASC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Record a payment
router.post('/payments', async (req, res) => {
  try {
    const { invoice_no, payment_amount, payment_type } = req.body;
    if (!invoice_no || !payment_amount || !payment_type)
      return res.status(400).json({ error: 'invoice_no, payment_amount, and payment_type are required' });

    const pool = await getPool();
    await pool.request()
      .input('invoice_no',      sql.Int,           parseInt(invoice_no))
      .input('payment_amount',  sql.Decimal(10,2),  Number(payment_amount))
      .input('payment_type_id', sql.NVarChar(50),   String(payment_type))
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
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Files ─────────────────────────────────────────────────────

// Files for an entity
router.get('/clients/:suie/files', async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request()
      .input('suie',   sql.NVarChar(50), req.params.suie)
      .input('emp_id', sql.NVarChar(50), req.user.emp_id);

    let query = `
      SELECT fi.file_info_id,
             fi.suie,
             fi.tax_year,
             fi.file_type_id,
             ft.file_type_desc,
             fi.file_info_name,
             fi.file_notes,
             fi.file_size,
             fi.created_dt
      FROM   file_info fi
      LEFT JOIN file_type ft ON ft.file_type_id = fi.file_type_id
      WHERE  fi.suie = @suie
        AND  EXISTS (
               SELECT 1 FROM people_entity pe
               WHERE pe.suie = fi.suie AND pe.assigned_prep = @emp_id
             )
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

// Open / serve a file
router.get('/files/:fileInfoId/open', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('fileInfoId', sql.Int,          parseInt(req.params.fileInfoId))
      .input('emp_id',     sql.NVarChar(50), req.user.emp_id)
      .query(`
        SELECT fi.file_info_id,
               fi.file_info_name,
               fi.suie,
               pe.sui
        FROM   file_info     fi
        JOIN   people_entity pe ON fi.suie = pe.suie
        WHERE  fi.file_info_id  = @fileInfoId
          AND  pe.assigned_prep = @emp_id
      `);

    if (!result.recordset.length) return res.status(404).json({ error: 'File not found' });

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

// Upload a file for an entity
const rawBody = express.raw({ type: '*/*', limit: '100mb' });

router.post('/upload/:suie', rawBody, async (req, res) => {
  try {
    const suie         = req.params.suie;
    const file_type_id = req.query.file_type_id;
    const tax_year     = req.query.tax_year;
    const filename     = req.query.filename;
    const fileBuffer   = req.body;

    if (!suie || !file_type_id || !filename || !Buffer.isBuffer(fileBuffer) || !fileBuffer.length) {
      return res.status(400).json({ error: 'suie, file_type_id, filename, and file body are required' });
    }

    const pool = await getPool();

    // Validate entity belongs to this employee
    const entityCheck = await pool.request()
      .input('suie',   sql.NVarChar(50), suie)
      .input('emp_id', sql.NVarChar(50), req.user.emp_id)
      .query(`SELECT sui FROM people_entity WHERE suie = @suie AND assigned_prep = @emp_id`);

    if (!entityCheck.recordset.length) {
      return res.status(403).json({ error: 'Entity not found or access denied' });
    }

    const sui = entityCheck.recordset[0].sui;

    const insertResult = await pool.request()
      .input('suie',           sql.NVarChar(50),  suie)
      .input('tax_year',       sql.Int,            tax_year ? parseInt(tax_year) : null)
      .input('file_type_id',   sql.NVarChar(50),   file_type_id)
      .input('file_info_name', sql.NVarChar(500),  filename)
      .input('file_size',      sql.Int,            fileBuffer.length)
      .query(`
        INSERT INTO file_info (suie, tax_year, file_type_id, file_info_name, file_size, created_dt)
        OUTPUT INSERTED.file_info_id
        VALUES (@suie, @tax_year, @file_type_id, @file_info_name, @file_size, GETDATE())
      `);

    const fileInfoId = insertResult.recordset[0].file_info_id;
    const dir        = path.join('C:\\projects\\ace\\repository', String(sui), String(suie));
    const destPath   = path.join(dir, `${fileInfoId}-${filename}`);

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(destPath, fileBuffer);

    res.json({ success: true, file_info_id: fileInfoId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Messages ──────────────────────────────────────────────────

// Messages for an entity
router.get('/clients/:suie/messages', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('suie', sql.NVarChar(50), req.params.suie)
      .query(`
        SELECT msg_id,
               msg_subject,
               msg_text,
               sent_by_id,
               to_id,
               from_id,
               msg_create_dt,
               suie,
               to_person = CASE
                 WHEN sent_by_id = 'E' THEN (
                   SELECT CASE WHEN first_name IS NULL OR first_name = '' THEN entityname
                               ELSE first_name + ' ' + last_name END
                   FROM people_entity WHERE suie = to_id
                 )
                 WHEN sent_by_id = 'C' THEN (
                   SELECT first_name + ' ' + last_name FROM employee WHERE emp_id = to_id
                 )
                 ELSE 'System'
               END,
               from_person = CASE
                 WHEN sent_by_id = 'E' THEN (
                   SELECT first_name + ' ' + last_name FROM employee WHERE emp_id = from_id
                 )
                 WHEN sent_by_id = 'C' THEN (
                   SELECT CASE WHEN first_name IS NULL OR first_name = '' THEN entityname
                               ELSE first_name + ' ' + last_name END
                   FROM people_entity WHERE suie = from_id
                 )
                 ELSE 'System'
               END
        FROM   msg_queue
        WHERE  suie = @suie
        ORDER BY msg_create_dt ASC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send a message to a client entity
router.post('/messages', async (req, res) => {
  try {
    const { subject, text, suie } = req.body;
    if (!subject || !text || !suie)
      return res.status(400).json({ error: 'subject, text, and suie are required' });

    const pool = await getPool();
    await pool.request()
      .input('subject', sql.NVarChar(500),     subject)
      .input('text',    sql.NVarChar(sql.MAX),  text)
      .input('suie',    sql.NVarChar(50),       String(suie))
      .input('emp_id',  sql.NVarChar(50),       String(req.user.emp_id))
      .query(`
        INSERT INTO msg_queue (msg_subject, msg_text, sent_by_id, to_id, from_id, msg_create_dt, suie)
        VALUES (@subject, @text, 'E', @suie, @emp_id, GETDATE(), @suie)
      `);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Lookups ───────────────────────────────────────────────────

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

router.get('/file-types', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT file_type_id, file_type_desc FROM file_type ORDER BY file_type_desc`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

router.get('/offices', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('emp_id', sql.NVarChar(50), req.user.emp_id)
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

// ── Profile ───────────────────────────────────────────────────

router.get('/profile', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('emp_id', sql.NVarChar(50), req.user.emp_id)
      .query(`SELECT first_name, last_name FROM employee WHERE emp_id = @emp_id`);
    res.json(result.recordset[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/profile/password', async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password)
    return res.status(400).json({ error: 'Current and new password are required.' });
  if (new_password.length < 6)
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('emp_id', sql.NVarChar(50), req.user.emp_id)
      .query(`SELECT password_hash FROM employee WHERE emp_id = @emp_id`);
    const user = result.recordset[0];
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect.' });
    const hash = await bcrypt.hash(new_password, 10);
    await pool.request()
      .input('emp_id', sql.NVarChar(50),  req.user.emp_id)
      .input('hash',   sql.NVarChar(255),  hash)
      .query(`UPDATE employee SET password_hash = @hash WHERE emp_id = @emp_id`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
