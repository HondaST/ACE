import { Router, Request, Response } from 'express';
import { registerUser, loginUser, verifyEmailToken } from '../services/authService';

const router = Router();

/** POST /api/auth/register */
router.post('/register', async (req: Request, res: Response) => {
  const { first_name, last_name, email, cell, password, confirm_password } =
    req.body as Record<string, string>;

  if (!first_name?.trim() || !last_name?.trim() || !email?.trim() ||
      !cell?.trim()        || !password          || !confirm_password) {
    res.status(400).json({ error: 'All fields are required.' });
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters.' });
    return;
  }

  if (password !== confirm_password) {
    res.status(400).json({ error: 'Passwords do not match.' });
    return;
  }

  try {
    await registerUser({
      first_name:   first_name.trim(),
      last_name:    last_name.trim(),
      email:        email.trim().toLowerCase(),
      cell:         cell.trim(),
      password,
    });
    res.json({ message: 'Account created! Please check your email to verify your account before signing in.' });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'EMAIL_EXISTS') {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }
    console.error('[auth] register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

/** POST /api/auth/login */
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as Record<string, string>;

  if (!email?.trim() || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  try {
    const token = await loginUser(email.trim().toLowerCase(), password);

    res.cookie('auth_token', token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({ message: 'Signed in successfully.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'INVALID_CREDENTIALS') {
      res.status(401).json({ error: 'Incorrect email or password.' });
      return;
    }
    if (msg === 'EMAIL_NOT_VERIFIED') {
      res.status(403).json({ error: 'Please verify your email address before signing in.' });
      return;
    }
    console.error('[auth] login error:', err);
    res.status(500).json({ error: 'Sign in failed. Please try again.' });
  }
});

/** GET /api/auth/verify/:token  — email verification */
router.get('/verify/:token', async (req: Request, res: Response) => {
  const token = String(req.params.token);

  try {
    await verifyEmailToken(token);
    res.redirect('/verified.html');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'TOKEN_INVALID') return void res.redirect('/?error=invalid_link');
    if (msg === 'TOKEN_EXPIRED') return void res.redirect('/?error=link_expired');
    console.error('[auth] verify error:', err);
    res.redirect('/?error=server_error');
  }
});

export default router;
