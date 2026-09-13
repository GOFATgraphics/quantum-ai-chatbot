import { getAdminClient } from './supabaseAdmin.js';
import { getValidToken } from './claudeTools.js';
import { searchGmail, createGmailDraft } from './google.js';

const MODEL = 'claude-haiku-4-5';

function gmailQuery(schedule) {
  const cfg = schedule.config || {};
  if (cfg.query) return String(cfg.query);
  const hours = Number(schedule.interval_hours) || 24;
  const days = Math.max(1, Math.ceil(hours / 24));
  return `in:inbox newer_than:${days}d`;
}

async function summarize(messages) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY');
  const digest = messages
    .map((m, i) => {
      const body = String(m.body || m.snippet || '').slice(0, 400);
      return `${i + 1}. From: ${m.from}\n   Subject: ${m.subject}\n   Date: ${m.date}\n   ${body}`;
    })
    .join('\n\n');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      system:
        'Write a short inbox briefing. Lead with what needs a reply or action. Group by theme. No fluff, no em dashes. Plain text only.',
      messages: [
        {
          role: 'user',
          content: `Summarize these emails from the last window. Flag anything urgent.\n\n${digest}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

/** First playbook: read recent mail, draft a summary to the user. Never auto-sends. */
export async function runDailyGmailDigest(schedule) {
  const admin = getAdminClient();
  const token = await getValidToken(schedule.user_id, 'gmail');
  if (!token) {
    throw new Error('Gmail is not connected. Connect Gmail in Quantumy first.');
  }
  const { data: authUser } = await admin.auth.admin.getUserById(schedule.user_id);
  const email = authUser?.user?.email;
  if (!email) throw new Error('No email on this account');

  const max = Math.min(30, Number(schedule.config?.max_messages) || 20);
  const messages = await searchGmail(token, gmailQuery(schedule), max);
  const dateLabel = new Date().toISOString().slice(0, 10);

  if (!messages.length) {
    return {
      kind: 'daily_gmail_digest',
      messages: 0,
      draft: false,
      note: 'No messages in this window.',
    };
  }

  const summary = await summarize(messages);
  const subject = `Quantumy inbox briefing — ${dateLabel}`;
  const body = `${summary}\n\n---\n${messages.length} messages scanned. This is a draft, not sent.`;
  const draft = await createGmailDraft(token, { to: email, subject, body });

  return {
    kind: 'daily_gmail_digest',
    messages: messages.length,
    draft: true,
    draftId: draft.id,
    subject,
  };
}

export async function runSchedule(schedule) {
  if (schedule.kind === 'daily_gmail_digest') return runDailyGmailDigest(schedule);
  throw new Error(`Unknown agent kind: ${schedule.kind}`);
}
