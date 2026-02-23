import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getPool, sql } from '../db';
import { sendVerificationEmail } from './emailService';

const JWT_SECRET   = process.env.JWT_SECRET ?? 'CHANGE_THIS_SECRET_IN_ENV';
const BCRYPT_ROUNDS = 12;
const TOKEN_TTL_MS  = 30 * 60 * 1000; // 30 minutes

export interface RegisterInput {
  first_name: string;
  last_name:  string;
  email:      string;
  cell:       string;
  password:   string;
}

/** Creates a new person record, stores a hashed password, and sends a verification email. */
export async function registerUser(input: RegisterInput): Promise<void> {
  const pool = await getPool();

  // Check for duplicate email
  const existing = await pool.request()
    .input('email', sql.VarChar(75), input.email)
    .query<{ sui: number }>('SELECT sui FROM people WHERE email = @email');

  if (existing.recordset.length > 0) {
    throw new Error('EMAIL_EXISTS');
  }

  // Hash password before storing
  const password_hash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

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

  // Generate a secure email-verification token
  const token   = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + TOKEN_TTL_MS);

  await pool.request()
    .input('sui',           sql.Int,         sui)
    .input('password_hash', sql.VarChar(255), password_hash)
    .input('token',         sql.VarChar(255), token)
    .input('token_type',    sql.VarChar(20),  'verify')
    .input('token_expires', sql.DateTime,     expires)
    .query(`
      INSERT INTO people_auth (sui, email_verified, password_hash, token, token_type, token_expires)
      VALUES (@sui, 0, @password_hash, @token, @token_type, @token_expires)
    `);

  const verifyUrl = `${process.env.APP_URL}/api/auth/verify/${token}`;
  await sendVerificationEmail(input.email, input.first_name, verifyUrl);
}

/** Validates email + password and returns a signed JWT.  Throws on any failure. */
export async function loginUser(email: string, password: string): Promise<string> {
  const pool = await getPool();

  const result = await pool.request()
    .input('email', sql.VarChar(75), email)
    .query<{ sui: number; first_name: string; password_hash: string; email_verified: boolean }>(`
      SELECT p.sui, p.first_name, pa.password_hash, pa.email_verified
      FROM   people      p
      JOIN   people_auth pa ON pa.sui = p.sui
      WHERE  p.email = @email
    `);

  // Use the same error message for "not found" and "wrong password"
  // to avoid leaking whether an email is registered
  if (result.recordset.length === 0) {
    throw new Error('INVALID_CREDENTIALS');
  }

  const user = result.recordset[0];

  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) {
    throw new Error('INVALID_CREDENTIALS');
  }

  if (!user.email_verified) {
    throw new Error('EMAIL_NOT_VERIFIED');
  }

  return jwt.sign(
    { sui: user.sui, email },
    JWT_SECRET,
    { expiresIn: '7d' },
  );
}

/** Validates an email-verification token and marks the account active. */
export async function verifyEmailToken(token: string): Promise<void> {
  const pool = await getPool();

  const result = await pool.request()
    .input('token', sql.VarChar(255), token)
    .query<{ sui: number; token_type: string; token_expires: Date }>(`
      SELECT sui, token_type, token_expires
      FROM   people_auth
      WHERE  token = @token
    `);

  if (result.recordset.length === 0)            throw new Error('TOKEN_INVALID');
  if (result.recordset[0].token_type !== 'verify') throw new Error('TOKEN_INVALID');
  if (new Date() > new Date(result.recordset[0].token_expires)) throw new Error('TOKEN_EXPIRED');

  const sui = result.recordset[0].sui;

  await pool.request()
    .input('sui', sql.Int, sui)
    .query(`
      UPDATE people_auth
      SET    email_verified = 1,
             token          = NULL,
             token_type     = NULL,
             token_expires  = NULL
      WHERE  sui = @sui
    `);
}
