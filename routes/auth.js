const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const pool = await getPool();
    const result = await pool.request()
      .input('username', sql.NVarChar(255), username)
      .query(`
        SELECT sui, username, password_hash, first_name, last_name, cell, email
        FROM people
        WHERE username = @username
      `);

    const user = result.recordset[0];
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      {
        sui: user.sui,
        username: user.username,
        name: `${user.first_name} ${user.last_name}`.trim(),
        role: 'client'
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ token, name: `${user.first_name} ${user.last_name}`.trim() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
