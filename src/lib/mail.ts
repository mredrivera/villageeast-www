import { config } from './env';
import { escapeHtml } from './format';

export type MailResult = { sent: boolean; reason?: 'not_allowlisted' | 'not_configured' | 'provider_error' };

/**
 * Sends a transactional email through Resend.
 *
 * DEMO SAFETY: mail is only ever sent to addresses on MAIL_ALLOWLIST. Anything else is dropped and
 * logged, so the demo site cannot email real residents by accident.
 */
export async function sendMail(opts: { to: string; subject: string; heading: string; lines: string[]; action?: { label: string; url: string } }): Promise<MailResult> {
  const to = opts.to.trim().toLowerCase();
  if (!config.mailAllowlist.includes(to)) {
    console.log(`mail suppressed (recipient not on MAIL_ALLOWLIST): "${opts.subject}"`);
    return { sent: false, reason: 'not_allowlisted' };
  }
  const key = config.resendApiKey;
  if (!key) {
    console.log(`mail skipped (RESEND_API_KEY not set): "${opts.subject}"`);
    return { sent: false, reason: 'not_configured' };
  }
  const paragraphs = opts.lines.map((l) => `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(l)}</p>`).join('');
  const button = opts.action
    ? `<p style="margin:22px 0"><a href="${escapeHtml(opts.action.url)}" style="background:#0f4c5c;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:600">${escapeHtml(opts.action.label)}</a></p>`
    : '';
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1c2b33;max-width:560px;margin:0 auto;padding:24px">
<p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#5b7480;margin:0 0 6px">Village East Property Owners Association</p>
<h1 style="font-size:22px;margin:0 0 18px">${escapeHtml(opts.heading)}</h1>${paragraphs}${button}
<p style="font-size:12px;color:#6b7f88;margin-top:28px;border-top:1px solid #dde5e8;padding-top:12px">This is a demonstration site. Smith Mountain Lake, Moneta, Virginia.</p></div>`;
  const text = [opts.heading, '', ...opts.lines, ...(opts.action ? ['', `${opts.action.label}: ${opts.action.url}`] : [])].join('\n');
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: config.mailFrom, to: [to], subject: opts.subject, html, text }),
    });
    if (!res.ok) {
      console.error('resend error', res.status, await res.text());
      return { sent: false, reason: 'provider_error' };
    }
    return { sent: true };
  } catch (err) {
    console.error('resend request failed', err);
    return { sent: false, reason: 'provider_error' };
  }
}

export async function notifyAdmin(subject: string, heading: string, lines: string[], path?: string): Promise<MailResult> {
  const to = config.adminNotifyEmail;
  if (!to) return { sent: false, reason: 'not_configured' };
  return sendMail({ to, subject, heading, lines, action: path ? { label: 'Open in admin', url: config.siteUrl + path } : undefined });
}
