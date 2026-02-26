const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../db');
const auth = require('../middleware/auth');

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
        SELECT DISTINCT tax_year
        FROM   file_info
        WHERE  suie = @suie
        ORDER BY tax_year DESC
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
      .input('from_id',  sql.NVarChar(50),      String(req.user.sui))
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
