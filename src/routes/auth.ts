import { Router, Request, Response } from 'express';
import { registerUser, requestLoginToken, verifyToken } from '../services/authService';

const router = Router();

/** POST /api/auth/register */
router.post('/register', async (req: Request, res: Response) => {
  const { first_name, last_name, email, cell } = req.body as Record<string, string>;

  if (!first_name?.trim() || !last_name?.trim() || !email?.trim() || !cell?.trim()) {
    res.status(400).json({ error: 'All fields are required.' });
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }

  try {
    await registerUser({ first_name: first_name.trim(), last_name: last_name.trim(), email: email.trim().toLowerCase(), cell: cell.trim() });
    res.json({ message: 'Account created! Please check your email to verify your account.' });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'EMAIL_EXISTS') {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }
    console.error('[auth] register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

/** POST /api/auth/login  — requests a magic link */
router.post('/login', async (req: Request, res: Response) => {
  const { email } = req.body as Record<string, string>;

  if (!email?.trim()) {
    res.status(400).json({ error: 'Email is required.' });
    return;
  }

  try {
    await requestLoginToken(email.trim().toLowerCase());
    // Always return the same message so we don't reveal whether an account exists
    res.json({ message: 'If an account exists for this email, a sign-in link has been sent.' });
  } catch (err) {
    console.error('[auth] login error:', err);
    res.status(500).json({ error: 'Could not send login link. Please try again.' });
  }
});

/** GET /api/auth/verify/:token  — handles both email verification and magic-link login */
router.get('/verify/:token', async (req: Request, res: Response) => {
  const { token } = req.params;

  try {
    const result = await verifyToken(token);

    if (result.type === 'verify') {
      res.redirect('/verified.html');
    } else {
      res.cookie('auth_token', result.jwt, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });
      res.redirect('/dashboard.html');
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'TOKEN_INVALID') return void res.redirect('/?error=invalid_link');
    if (msg === 'TOKEN_EXPIRED') return void res.redirect('/?error=link_expired');
    console.error('[auth] verify error:', err);
    res.redirect('/?error=server_error');
  }
});

export default router;
