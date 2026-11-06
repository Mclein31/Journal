import { betterAuth } from 'better-auth';
import { emailOTP } from 'better-auth/plugins';
import type { Pool } from '@neondatabase/serverless';
import type { Env } from './env';
import { sendEmail } from './email';

export function createAuth(env: Env, pool: Pool, schedule: (task: Promise<unknown>) => void, deliver = sendEmail) {
  return betterAuth({
    appName: 'Dear Days',
    database: pool,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.APP_ORIGIN],
    // Password sign-in stays unchanged; only verification and recovery use codes.
    disabledPaths: ['/sign-in/email-otp', '/request-password-reset', '/forget-password/email-otp', '/email-otp/check-verification-otp'],
    plugins: [emailOTP({
      otpLength: 6,
      expiresIn: 600,
      allowedAttempts: 5,
      storeOTP: 'hashed',
      disableSignUp: true,
      overrideDefaultEmailVerification: true,
      rateLimit: { window: 60, max: 5 },
      sendVerificationOTP: async ({ email, otp, type }) => {
        schedule(deliver(env, email, type === 'forget-password' ? 'Reset your password' : 'Verify your email', otp));
      },
    })],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 10,
      revokeSessionsOnPasswordReset: true,
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
    },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 60,
      customRules: {
        '/sign-up/email': { window: 60, max: 5 },
        '/sign-in/email': { window: 60, max: 10 },
        '/send-verification-email': { window: 60, max: 3 },
        '/request-password-reset': { window: 60, max: 3 },
        '/email-otp/send-verification-otp': { window: 60, max: 3 },
        '/email-otp/request-password-reset': { window: 60, max: 3 },
        '/email-otp/verify-email': { window: 60, max: 10 },
        '/email-otp/reset-password': { window: 60, max: 10 },
      },
    },
    advanced: {
      useSecureCookies: env.APP_ORIGIN.startsWith('https://'),
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
    },
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [user.id]);
            await client.query('INSERT INTO journal_account_state(user_id,deleting) VALUES($1,true) ON CONFLICT(user_id) DO UPDATE SET deleting=true', [user.id]);
            await client.query('COMMIT');
          } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
          finally { client.release(); }
          // Delete media first: failures leave the account intact so deletion can be retried.
          const assets = await pool.query<{ r2_key: string }>('SELECT r2_key FROM journal_assets WHERE user_id = $1', [user.id]);
          for (let i = 0; i < assets.rows.length; i += 100) {
            await env.JOURNAL_FILES.delete(assets.rows.slice(i, i + 100).map((row) => row.r2_key));
          }
        },
      },
    },
  });
}
