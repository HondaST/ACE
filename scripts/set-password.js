require('dotenv').config({ path: 'C:/projects/ACE/.env' });
const sql    = require('mssql');
const bcrypt = require('bcrypt');

const serverParts = process.env.DB_SERVER.split(',');
const config = {
  server:   serverParts[0],
  port:     parseInt(serverParts[1]) || 1433,
  database: process.env.DB_DATABASE,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options:  { encrypt: false, trustServerCertificate: true }
};

(async () => {
  const pool = await sql.connect(config);

  // Ensure username and password_hash columns exist on employee table
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'employee' AND COLUMN_NAME = 'username'
    )
      ALTER TABLE employee ADD username VARCHAR(100) NULL;
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'employee' AND COLUMN_NAME = 'password_hash'
    )
      ALTER TABLE employee ADD password_hash VARCHAR(255) NULL;
  `);

  console.log('Columns ensured.');

  const email    = process.argv[2];
  const password = process.argv[3];
  const username = process.argv[4] || email;

  if (!email || !password) {
    console.error('Usage: node set-password.js <email> <password> [username]');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);

  const result = await pool.request()
    .input('hash',     sql.NVarChar(255), hash)
    .input('username', sql.NVarChar(100), username)
    .input('email',    sql.NVarChar(255), email)
    .query(`
      UPDATE employee
      SET    password_hash = @hash,
             username      = @username
      WHERE  email = @email
    `);

  console.log('Rows updated:', result.rowsAffected[0]);
  await pool.close();
})().catch(err => { console.error('Error:', err.message); process.exit(1); });
