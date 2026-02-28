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
      .input('suie',     sql.NVarChar(50),      suie)
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

module.exports = router;
