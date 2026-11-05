import nodemailer from 'nodemailer';
import { connect } from 'node:tls';
import type { Env } from './env';

/** One bounded, encrypted SMTP connection per delivery; credentials stay in the Worker. */
export async function sendEmail(env: Env, to: string, subject: string, url: string): Promise<void> {
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT),
    secure: env.SMTP_SECURE === 'true',
    requireTLS: true,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS.replace(/\s/g, '') },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    pool: false,
    // Let the Worker resolve the hostname. Nodemailer's pre-resolved IP path
    // can be rejected by Cloudflare's outbound socket proxy.
    getSocket(_options, callback) {
      let settled = false;
      const socket = connect({ host: env.SMTP_HOST, port: Number(env.SMTP_PORT), servername: env.SMTP_HOST }, () => {
        settled = true;
        callback(null, { connection: socket, secured: true });
      });
      socket.setTimeout(10_000, () => socket.destroy(new Error('SMTP connection timed out')));
      socket.once('error', (error) => { if (!settled) { settled = true; callback(error, false); } });
    },
  });
  try {
    await transport.sendMail({
      from: env.EMAIL_FROM,
      to,
      subject: `${subject} · Dear Days`,
      text: `${subject}\n\nOpen this link to continue:\n${url}\n\nIf you didn't request this, you can ignore this email.\n\nDear Days`,
    });
  } finally { transport.close(); }
}
