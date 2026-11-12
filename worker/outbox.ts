import type { Event } from '../shared/model';
import { money } from '../shared/model';
import { createHash } from 'node:crypto';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type Mail from 'nodemailer/lib/mailer';
export function digestText(events: Event[]) {
  return ['Huurmonitor · Groningen', '', 'Wijzigingen die nu aan je opgeslagen profiel voldoen. Controleer beschikbaarheid en bijkomende kosten bij de bron.', '',
    ...events.map(e => `${e.reason}: ${e.listing.title}\n${money(e.listing.rent.knownMonthly)} bekende maandlasten (geen all-in garantie)\n${e.listing.url}\n`)].join('\n');
}
export function retryKey(digestId: string) { return `huurmonitor-digest/${digestId}`; }
export type EmailTransport = 'gmail' | 'resend';
export function singleEmail(value: string | undefined): value is string {
  return !!value && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(value);
}
/** Validation only: never connect, verify, log or persist credentials. */
export function emailConfiguration(env: NodeJS.ProcessEnv): EmailTransport {
  if (env.EMAIL_TRANSPORT !== 'gmail' && env.EMAIL_TRANSPORT !== 'resend') throw new Error('Email configuration incomplete: set EMAIL_TRANSPORT=gmail or resend explicitly');
  if (env.EMAIL_TRANSPORT === 'gmail') {
    if (!singleEmail(env.GMAIL_USER) || !/^[A-Za-z0-9]{16}$/.test((env.GMAIL_APP_PASSWORD ?? '').replace(/\s/g,''))) throw new Error('Gmail configuration incomplete: set worker-only GMAIL_USER and a 16-character GMAIL_APP_PASSWORD in ignored .env; never paste it into chat');
  } else if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new Error('Resend email configuration incomplete: set RESEND_API_KEY and EMAIL_FROM');
  return env.EMAIL_TRANSPORT;
}
type GmailOptions = SMTPTransport.Options & { pool: false };
interface SmtpSession {
  sendMail(message: Mail.Options): Promise<{accepted: Array<string | Mail.Address>; rejected: Array<string | Mail.Address>}>;
  close(): void;
}
export interface MailDependencies {
  smtp?: (options: GmailOptions)=>SmtpSession;
  resend?: typeof fetch;
}
export async function sendDigest(id: string, events: Event[], recipient: string, env: NodeJS.ProcessEnv, dependencies: MailDependencies = {}) {
  if (env.ENABLE_EMAIL !== 'true') throw new Error('Email is disabled');
  const transport = emailConfiguration(env);
  if (!singleEmail(recipient)) throw new Error('Provisioned owner email unavailable or invalid');
  const subject = `Huurmonitor: ${events.length} relevante wijziging${events.length === 1 ? '' : 'en'}`;
  if (transport === 'gmail') {
    let smtp: SmtpSession | undefined;
    try {
      smtp = (dependencies.smtp ?? (options=>nodemailer.createTransport(options)))({
        host:'smtp.gmail.com', port:465, secure:true, pool:false,
        auth:{user:env.GMAIL_USER!,pass:env.GMAIL_APP_PASSWORD!.replace(/\s/g,'')},
        tls:{rejectUnauthorized:true,minVersion:'TLSv1.2'},
        connectionTimeout:10000,greetingTimeout:10000,socketTimeout:30000,
        logger:false,debug:false,
      });
      const info = await smtp.sendMail({
        from:env.GMAIL_USER!,to:[recipient],envelope:{from:env.GMAIL_USER!,to:[recipient]},subject,text:digestText(events),
        messageId:`<huurmonitor-${createHash('sha256').update(id).digest('hex')}@${env.GMAIL_USER!.split('@')[1]}>`,
        disableFileAccess:true,disableUrlAccess:true,
      });
      const accepted = info.accepted.map(value=>typeof value === 'string' ? value : value.address);
      if (accepted.length !== 1 || typeof accepted[0] !== 'string' || accepted[0].toLowerCase() !== recipient.toLowerCase() || info.rejected.length) throw new Error('Recipient not accepted');
      return; // SMTP acceptance, not proof of inbox delivery. Message-ID is tracing only.
    } catch { throw new Error('Gmail delivery not confirmed; manual review required; no automatic SMTP retry'); }
    finally { try { smtp?.close(); } catch { /* Never expose protocol/socket errors. */ } }
  }
  let response: Response;
  try { response = await (dependencies.resend ?? fetch)('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': retryKey(id) },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [recipient], subject, text: digestText(events) }),
    signal: AbortSignal.timeout(30000),
  }); } catch { throw new Error('Resend request unconfirmed; same digest key required on retry'); }
  if (!response.ok) throw new Error(`Resend HTTP ${response.status}; same digest key required on retry`);
}
