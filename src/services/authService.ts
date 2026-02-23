import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getPool, sql } from '../db';
import { sendVerificationEmail, sendLoginEmail } from './emailService';

const JWT_SECRET = process.env.JWT_SECRET ?? 'CHANGE_THIS_SECRET_IN_ENV';
const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface RegisterInput {
  first_name: string;
  last_name: string;
  email: string;
  cell: string;
}

/** Creates a new person record and sends a verification email. */
export async function registerUser(input: RegisterInput): Promise<void> {
  const pool = await getPool();

  // Check for existing email
  const existing = await pool.request()
    .input('email', sql.VarChar(75), input.email)
    .query<{ sui: number }>('SELECT sui FROM people WHERE email = @email');

  if (existing.recordset.length > 0) {
    throw new Error('EMAIL_EXISTS');
  }

  // Insert into people (sui is IDENTITY — returned via OUTPUT)
  const inserted = await pool.request()
    .input('first_name', sql.VarChar(75), input.first_name)
    .input('last_name',  sql.VarChar(75), input.last_name)
    .input('email',      sql.VarChar(75), input.email)
    .input('cell',       sql.VarChar(25), input.cell)
    .query<{ sui: number }>(`
      INSERT INTO people (first_name, last_name, email, cell, created_date)
      OUTPUT INSERTED.sui
      VALUES (@first_name, @last_name, @email, @cell, GETDATE())
    `);

  const sui = inserted.recordset[0].sui;

  // Generate a secure verification token
  const token   = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + TOKEN_TTL_MS);

  await pool.request()
    .input('sui',           sql.Int,         sui)
    .input('token',         sql.VarChar(255), token)
    .input('token_type',    sql.VarChar(20),  'verify')
    .input('token_expires', sql.DateTime,     expires)
    .query(`
      INSERT INTO people_auth (sui, email_verified, token, token_type, token_expires)
      VALUES (@sui, 0, @token, @token_type, @token_expires)
    `);

  const verifyUrl = `${process.env.APP_URL}/api/auth/verify/${token}`;
  await sendVerificationEmail(input.email, input.first_name, verifyUrl);
}

/** Sends a magic-link login email.  Silently no-ops for unknown/unverified emails. */
export async function requestLoginToken(email: string): Promise<void> {
  const pool = await getPool();

  const result = await pool.request()
    .input('email', sql.VarChar(75), email)
    .query<{ sui: number; first_name: string; email_verified: boolean }>(`
      SELECT p.sui, p.first_name, pa.email_verified
      FROM   people      p
      JOIN   people_auth pa ON pa.sui = p.sui
      WHERE  p.email = @email
    `);

  if (result.recordset.length === 0) return;          // no account — stay silent
  const user = result.recordset[0];
  if (!user.email_verified) return;                   // not yet verified — stay silent

  const token   = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + TOKEN_TTL_MS);

  await pool.request()
    .input('sui',           sql.Int,         user.sui)
    .input('token',         sql.VarChar(255), token)
    .input('token_type',    sql.VarChar(20),  'login')
    .input('token_expires', sql.DateTime,     expires)
    .query(`
      UPDATE people_auth
      SET    token = @token, token_type = @token_type, token_expires = @token_expires
      WHERE  sui = @sui
    `);

  const loginUrl = `${process.env.APP_URL}/api/auth/verify/${token}`;
  await sendLoginEmail(email, user.first_name, loginUrl);
}

/** Validates a token and returns its type + a JWT when it's a login token. */
export async function verifyToken(token: string): Promise<{ type: string; jwt?: string }> {
  const pool = await getPool();

  const result = await pool.request()
    .input('token', sql.VarChar(255), token)
    .query<{ sui: number; token_type: string; token_expires: Date; email: string; first_name: string }>(`
      SELECT pa.sui, pa.token_type, pa.token_expires, p.email, p.first_name
      FROM   people_auth pa
      JOIN   people      p  ON p.sui = pa.sui
      WHERE  pa.token = @token
    `);

  if (result.recordset.length === 0) throw new Error('TOKEN_INVALID');

  const rec = result.recordset[0];
  if (new Date() > new Date(rec.token_expires)) throw new Error('TOKEN_EXPIRED');

  // Clear the one-time token regardless of type
  await pool.request()
    .input('sui', sql.Int, rec.sui)
    .query(`
      UPDATE people_auth
      SET    token = NULL, token_type = NULL, token_expires = NULL
      WHERE  sui = @sui
    `);

  if (rec.token_type === 'verify') {
    await pool.request()
      .input('sui', sql.Int, rec.sui)
      .query('UPDATE people_auth SET email_verified = 1 WHERE sui = @sui');

    return { type: 'verify' };
  }

  // Login token — issue a JWT
  const jwtToken = jwt.sign(
    { sui: rec.sui, email: rec.email },
    JWT_SECRET,
    { expiresIn: '7d' },
  );

  return { type: 'login', jwt: jwtToken };
}
