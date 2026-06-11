# MCTI Cash Customer Invoice Generator

Material tracking and invoice generation system for Tabib Al Arabia / MCTI branches. Built with Next.js 14, React, Tailwind CSS, and Google Sheets as the storage backend.

## Features

- Branch selection (Head Office is password-protected, verified server-side)
- Fast material entry with autocomplete, Excel-style keyboard navigation, and inline row editing
- Reports saved to Google Sheets with auto-incrementing report numbers (duplicate-safe)
- Load, update, and delete previously saved invoices
- Export to PDF (delivery note and stock report), Excel, and print views
- Editable summary table for bulk unit-price updates per material
- Work-in-progress is kept in localStorage so a page refresh doesn't lose data

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure environment variables:

   ```bash
   cp .env.example .env.local
   ```

   Then fill in the values (see below).

3. Run the dev server:

   ```bash
   npm run dev
   ```

   Open http://localhost:3000.

## Environment variables

| Variable | Description |
|---|---|
| `GOOGLE_SPREADSHEET_ID` | ID of the Google Sheets spreadsheet that stores reports |
| `GOOGLE_PROJECT_ID` | Google Cloud project ID of the service account |
| `GOOGLE_CLIENT_EMAIL` | Service account email |
| `GOOGLE_PRIVATE_KEY` | Service account private key (keep quotes, use `\n` for newlines) |
| `HEAD_OFFICE_PASSWORD` | Password required to enter the Head Office branch |

For production, set the same variables in **Vercel → Project Settings → Environment Variables** and redeploy.

> **Security note:** an earlier version of this repo had the service-account private key committed in source code. That key is in git history and should be considered compromised — rotate it in Google Cloud Console (IAM & Admin → Service Accounts → Keys) and update `GOOGLE_PRIVATE_KEY` everywhere.

The service account must have edit access to the spreadsheet (share the sheet with the service account email).

## Project structure

- `app/page.tsx` — the whole UI: branch/customer flow, material table, exports
- `app/api/sheets/route.ts` — Google Sheets CRUD (reports, report numbers)
- `app/api/auth/route.ts` — server-side Head Office password check
- `lib/materials-list.ts` — autocomplete suggestions for material names
- `components/ui/` — shadcn/ui primitives (button, card, input, label)

## Scripts

- `npm run dev` — development server
- `npm run build` — production build (TypeScript and ESLint errors fail the build)
- `npm run start` — serve the production build
- `npm run lint` — lint
