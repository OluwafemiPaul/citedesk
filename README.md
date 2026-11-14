# CiteDesk

**An AI support assistant for small businesses. It answers only from your own website and documents, cites every source, and hands hard questions to a human. Businesses bring their own AI key.**

**Status:** Phase 1 in progress (Week 1: accounts, approval and owner dashboard). Free pilot for small businesses.
**Live:** https://citedesk-app.vercel.app (sample bot at [/demo](https://citedesk-app.vercel.app/demo))
**Prototype:** CiteDesk grew out of the [Ledgerly Support Agent](https://github.com/OluwafemiPaul/ai-support-agent).

## What it does

* **Answers from your content only**, with a link to the source page under every answer.
* **Hands off to a person** for fraud, account problems, legal threats, requests for a human, or any answer it is not sure about, with a ready ticket.
* **Imports your website** so you do not need a help center first (Week 2).
* **One line of code** adds a chat bubble to any site (Week 3).
* **Bring your own AI key** (Anthropic or OpenAI), so there is no AI markup.
* **Owner approval and limits** so the hosted service never runs up surprise costs.

## Roadmap

| Week | Scope | Status |
|---|---|---|
| 1 | Landing page, request access, owner approval, sign in, owner dashboard, plan limits, usage alerts | In progress |
| 2 | Setup wizard, AI key connection, website import, uploads, articles, answer engine | Planned |
| 3 | Chat bubble, hosted help page, handoff emails, business dashboard, self hosting | Planned |

Product docs: PRD and FRD (linked in the project notes).

## Run it locally

You need Node.js 20 or newer and a free [Supabase](https://supabase.com) project.

1. Clone and install:
   ```bash
   git clone https://github.com/OluwafemiPaul/citedesk.git
   cd citedesk
   npm install
   cp .env.example .env.local
   ```
2. In Supabase, open **SQL Editor** and run each file in `supabase/migrations` in order (`0001_foundation.sql`, then `0002_email_log_and_notices.sql`).
3. Fill in `.env.local`: your Supabase URL and keys, and your email as `PLATFORM_OWNER_EMAIL`.
4. In Supabase, open **Authentication, URL Configuration** and add `http://localhost:3000/auth/callback` to Redirect URLs.
5. Start it:
   ```bash
   npm run dev
   ```
6. Open http://localhost:3000/login, sign in with your owner email, and go to `/owner`.

Without email settings or Turnstile keys, emails are printed to the terminal and the bot check is skipped, so everything still works locally.

### Email without a domain

CiteDesk can send through any SMTP account, including a free Gmail with an app password (about 500 recipients a day). Set `SMTP_USER`, `SMTP_PASS` and `EMAIL_FROM` in your environment, and put the same Gmail details in Supabase under **Authentication, Emails, SMTP Settings** so sign in links reach everyone. Once you own a domain, set `RESEND_API_KEY` and `EMAIL_FROM` instead. Every email attempt appears in the **Email log** on the owner dashboard, with the reason if it failed, and businesses also see important messages as notices in their dashboard.

## Tech

Next.js 16, React 19, TypeScript, Tailwind CSS 4, Supabase (Postgres, Auth, row level security), Nodemailer (SMTP) or Resend, Cloudflare Turnstile, Anthropic and OpenAI APIs, Vercel.

## License

[GNU AGPL v3](LICENSE). You can use, change and self host CiteDesk freely. If you offer a changed version as a service to others, you must share your changes under the same license.
