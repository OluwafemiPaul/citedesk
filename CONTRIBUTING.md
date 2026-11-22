# Contributing to CiteDesk

Thanks for helping. CiteDesk is AGPL 3.0 licensed; by contributing you agree your work is shared under the same license.

## Getting started

1. Follow "Run it locally" in the README.
2. Create a branch for your change.
3. Run `npx tsc --noEmit` and `npm run build` before opening a pull request.

## Guidelines

* Keep the core promise: answers only from a business's approved content, with real citations, and a handoff when unsure.
* Every table a business owns needs an `account_id` and row level security. Never send AI keys to the browser or logs.
* Database changes go in a new numbered file in `supabase/migrations`; never edit a migration that has shipped.
* Write user facing text in plain English for non technical business owners.
* Keep `public/widget.js` small (under 30 KB) and free of dependencies.

## Reporting security issues

Please do not open a public issue for security problems. Email the maintainer instead (see the GitHub profile), and we will respond as soon as we can.
