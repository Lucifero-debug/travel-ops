# CONTEXT

Handover document for travel-ops. Read this before changing anything; the
README says what the project is and how to run it.

Written so another assistant (ChatGPT, Gemini, Claude) or a future you can
continue without having seen it built.

---

## 1. What this is, and who for

A back office for a **small Indian tour operator**: two to ten staff,
selling customised and packaged holidays, mostly over WhatsApp, taking
money in instalments, and buying from hotels, transporters and DMCs.

Their current system is WhatsApp plus a spreadsheet plus memory. The
specific failures it causes, which this software exists to fix:

1. Enquiries go cold because nobody remembers to follow up.
2. Nobody knows a trip's margin until after it is over, if ever.
3. Balance payments are chased from memory, late.
4. Vendor payments are missed, which is how operators lose good rates.
5. Quotes are rewritten from scratch every time.

Every design decision below serves one of those five.

**Deliberately out of scope:** GDS/flight integration, payment gateways, a
public booking site, visa workflows, full accounting. Say no to these, or
the project never ships.

---

## 2. Stack and conventions

- **Next.js 15 App Router, TypeScript, Tailwind v4** (configured in CSS, no
  `tailwind.config.js`), **PostgreSQL + Prisma**. Same as clinic-ms.
- **Server Components by default.** Reach for a client component only for
  something genuinely interactive; forms use **server actions**.
- **Money is paise, as `Int`.** Always. `lib/money.ts` has the helpers; no
  component should do its own arithmetic on rupees.
- **Validate with zod inside the server action**, not in the component.
- **Codes humans say aloud** (`ENQ-2026-0001`, `TRP-2026-0003`,
  `INV-2026-0007`) exist alongside cuid primary keys. Staff quote codes on
  the phone; never show a cuid in the interface.
- **British spelling** in copy and comments.

---

## 3. The data model

Read `prisma/schema.prisma`; it is commented. The parts that matter:

- **Copy, don't reference, anything a customer has been shown.**
  `Quotation` copies the package's days into `QuotationDay`; `Booking`
  copies the agreed `sellPaise`. Editing a template must never change a
  quote already sent, or an agreed price.
- **`Payment` covers both received and planned money.** A row with
  `dueOn` set and `paidOn` null is an instalment that has not arrived; it
  drives the balance-due reminders and the outstanding figure.
- **`VendorBooking` is where margin comes from.** It carries `costPaise`
  (what the operator pays), `paidPaise` and a status from PLANNED to PAID,
  so the trip's cost is known while it is still being arranged.
- **`Activity`** is one timeline across enquiries and bookings. Staff trust
  a system that can answer "what did we tell them last week".
- **`Reminder`** rows are what a scheduled job should send: follow-up,
  balance due, documents pending, departure, return feedback, vendor
  payment.
- **`Settings`** is a single row (id 1) with the operator's own details for
  invoices and vouchers.

Invoice numbers must be **sequential and never reused**, for GST. Generate
them in a transaction when an invoice is issued, not when a draft is
created.

---

## 4. What exists and what does not

**Done:** the schema, the Prisma client, the money and format helpers, the
seed, and these screens:

- **Shell and dashboard** (`app/page.tsx`): follow-ups due, money owed to
  us, departures within a fortnight, vendors to pay, and this month's
  sales and margin.
- **Enquiries** (`app/enquiries/`): list with stage filters and search, a
  create form, a detail page with the activity timeline, logging a call or
  WhatsApp, setting the next follow-up, changing stage with a lost reason,
  and converting to a booking.
- **Bookings** (`app/bookings/`): list with outstanding and margin per
  row; a detail page with the four money figures, payments (including
  instalments that are due but unpaid), vendor costs with status,
  travellers with ID tracking, and issuing an invoice.
- **Invoice** (`app/invoices/[id]`): a printable tax invoice that splits
  CGST and SGST within the state and charges IGST outside it.
- **Packages** (`app/packages/`): create and list, with day scaffolding.

**Not built yet,** in the order I would build it:

1. **Quotation builder.** Start from a package or blank, price per adult
   and child, edit the copied days, produce a shareable page or PDF, and
   accept into a booking. Today, conversion happens straight from an
   enquiry with an agreed price.
2. **Itinerary editing** on packages: reorder, edit and delete days.
3. **Auth and roles.** The `Role` enum exists; OWNER sees costs and
   margin, AGENT does not. Hide them in the queries, not just the UI.
4. **Reminders worker.** A cron route that reads due `Reminder` rows and
   sends them over WhatsApp.
5. **Documents and vouchers:** upload, and a printable hotel or transport
   voucher per vendor booking.
6. **Reports:** sales and margin by month, destination and agent;
   conversion by source; lost reasons.
7. **Cancellation screen** using the `Cancellation` model.
8. **Settings screen** for the single `Settings` row (currently seed-only).

**Known rough edges:** validation errors from server actions surface as
thrown errors rather than inline field messages; there is no pagination
(lists cap at 100); and the seed must be re-run after `db push --force`.

---

## 5. Decisions already made, with reasons

- **Postgres, not SQLite**, to match clinic-ms and because Vercel
  deployment with Neon is the intended path.
- **Paise everywhere**, see README.
- **GST rate stored per invoice**, because whether a tour operator charges
  5% on the gross package or 18% on a service fee depends on how they
  contract, and that is their accountant's call.
- **Customer identified by phone.** Email is optional: this market runs on
  WhatsApp, and many customers never give an email address.
- **Traveller is separate from Customer.** The person paying is often not
  travelling, and names must match ID documents exactly for tickets and
  hotels.
- **Cancellation is its own model** with retention, vendor loss and refund,
  because "what do we owe them back" is a question with three parts and
  gets asked under pressure.

---

## 6. If you are an AI continuing this

- Keep the scope. The temptation is to add flight booking; resist it.
- Match the existing style: server components, server actions, zod at the
  boundary, paise, codes for humans.
- When you add a screen, add it to section 4 of this file and mark what is
  done. A stale handover file is worse than none.
- The seed is the fastest way to see whether a screen works: run
  `npm run db:seed` and build against real-shaped data rather than empty
  tables.
- Do not invent fields in the schema to make a screen easier. If something
  is missing, add it deliberately and write down why here.
