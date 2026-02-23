import nodemailer from 'nodemailer';

function createTransporter() {
  return nodemailer.createTransport({
    host:   process.env.EMAIL_HOST ?? 'smtp.gmail.com',
    port:   parseInt(process.env.EMAIL_PORT ?? '587', 10),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

const FROM = process.env.EMAIL_FROM ?? '"Tax Paladin" <noreply@taxpaladin.com>';

export async function sendVerificationEmail(
  to: string,
  firstName: string,
  verifyUrl: string,
): Promise<void> {
  await createTransporter().sendMail({
    from:    FROM,
    to,
    subject: 'Verify your Tax Paladin account',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px;">
        <h2 style="color:#1e3a5f;margin-top:0;">Welcome to Tax Paladin, ${firstName}!</h2>
        <p style="color:#374151;">Thanks for creating an account. Please verify your email address to get started.</p>
        <p style="text-align:center;margin:32px 0;">
          <a href="${verifyUrl}"
             style="display:inline-block;padding:14px 28px;background:#1a56db;color:#ffffff;
                    border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px;">
            Verify My Account
          </a>
        </p>
        <p style="color:#6b7280;font-size:13px;">
          This link expires in 30&nbsp;minutes. If you didn't create an account you can safely ignore this email.
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:12px;margin:0;">Tax Paladin &mdash; secure tax preparation management</p>
      </div>
    `,
  });
}

export async function sendLoginEmail(
  to: string,
  firstName: string,
  loginUrl: string,
): Promise<void> {
  await createTransporter().sendMail({
    from:    FROM,
    to,
    subject: 'Your Tax Paladin sign-in link',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px;">
        <h2 style="color:#1e3a5f;margin-top:0;">Sign in to Tax Paladin</h2>
        <p style="color:#374151;">Hi ${firstName}, click the button below to sign in. This link can only be used once.</p>
        <p style="text-align:center;margin:32px 0;">
          <a href="${loginUrl}"
             style="display:inline-block;padding:14px 28px;background:#1a56db;color:#ffffff;
                    border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px;">
            Sign In to My Account
          </a>
        </p>
        <p style="color:#6b7280;font-size:13px;">
          This link expires in 30&nbsp;minutes. If you didn't request this, you can safely ignore this email.
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:12px;margin:0;">Tax Paladin &mdash; secure tax preparation management</p>
      </div>
    `,
  });
}
