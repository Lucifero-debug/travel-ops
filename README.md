# Travel Ops

Back office for a small Indian tour operator. Enquiries in, trips out, and
an honest view of what each one earned.

**Stack:** Next.js 15 (App Router), TypeScript, PostgreSQL, Prisma,
Tailwind v4. Same shape as clinic-ms and resto-pos.

---

## Scope

**In:** enquiries and follow-ups, packages with day-wise itineraries,
quotations with versions, bookings, travellers and their ID details,
instalment payments, vendor bookings with costs (and therefore margin),
GST invoices, vouchers and documents, WhatsApp reminders, and reports.

**Out, deliberately:** flight and GDS integration, online payment
gateways, a public booking website, visa processing, and full accounting.
Each is a product of its own, and a small operator already has a CA.

The one thing this does that spreadsheets cannot: **show the margin on
every trip while it is still being planned**, because costs are recorded
against the booking as vendors are confirmed.

---

## Getting started

```bash
npm install
cp .env.example .env            # add your DATABASE_URL
npm run db:push                 # create the tables
npm run db:seed                 # realistic sample data
npm run dev
```

Any Postgres works: a local install, Docker, Neon or Supabase.

---

## How the pieces fit

```
Enquiry  ──quote──>  Quotation  ──accept──>  Booking
                                               ├── Travellers
                                               ├── Payments      (money in, usually instalments)
                                               ├── VendorBookings (money out, gives margin)
                                               ├── Invoices
                                               └── Documents, Reminders
```

**Enquiry** is the unit of sales work: most never convert, so they carry a
stage, a next-follow-up date and a lost reason. Knowing why you lose is
worth more than knowing that you lost.

**Quotation** copies the package's days rather than pointing at them, and
keeps a version number. A quote sent in March must still read the same in
June after someone edits the template.

**Booking** copies the agreed sell price at confirmation, for the same
reason.

**Margin** is sell price minus the sum of vendor costs, available at any
point, not only after the trip.

---

## Money

Every amount is an **integer number of paise**. Floating point money
produces invoices that are a paisa out, and with four instalments across
three months that error compounds into a phone call. Rupees exist only at
the edges: `toPaise()` on input, `rupees()` on output, both in
`lib/money.ts`.

GST is stored per invoice rather than assumed, because whether a tour
operator charges 5% on the gross package without input credit, or 18% on a
service fee as a pure agent, is their accountant's decision and not this
software's.

---

## Files

```
prisma/schema.prisma    the data model, commented
prisma/seed.ts          sample operator, packages, a live booking
lib/db.ts               the shared Prisma client
lib/money.ts            paise, formatting, GST, booking totals
app/                    screens (see CONTEXT.md for what to build next)
```

`CONTEXT.md` is the handover document: read that before changing anything.
