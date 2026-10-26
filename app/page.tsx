import { db } from "@/lib/db";
import { rupeesShort, rupees } from "@/lib/money";
import { fmtDate, relative, isOverdue, tone } from "@/lib/format";
import Link from "next/link";

/*
  The dashboard answers the five questions that a spreadsheet cannot:

    who needs following up today
    who owes money
    which vendors need paying
    who is travelling soon
    what did we sell and earn this month

  Nothing else belongs here. A dashboard that tries to show everything is
  read by nobody.
*/

export const dynamic = "force-dynamic";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="text-[12px] text-[color:var(--color-muted)]">{label}</div>
      <div className="mt-1 text-[22px] font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-[color:var(--color-muted)]">{sub}</div>}
    </div>
  );
}

function Panel({ title, children, empty }: { title: string; children: React.ReactNode; empty: boolean }) {
  return (
    <section className="card">
      <h2 className="border-b border-[color:var(--color-line)] px-4 py-3 text-[14px] font-semibold">
        {title}
      </h2>
      {empty ? (
        <p className="px-4 py-6 text-[13px] text-[color:var(--color-muted)]">Nothing here. Good.</p>
      ) : (
        <ul className="divide-y divide-[color:var(--color-line)]">{children}</ul>
      )}
    </section>
  );
}

export default async function Dashboard() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const inDays = (n: number) => new Date(Date.now() + n * 864e5);

  const [followUps, bookings, monthBookings, dueVendors] = await Promise.all([
    db.enquiry.findMany({
      where: { stage: { in: ["NEW", "CONTACTED", "QUOTED", "NEGOTIATING"] }, nextFollowUp: { lte: inDays(1) } },
      include: { customer: true },
      orderBy: { nextFollowUp: "asc" },
      take: 8,
    }),
    db.booking.findMany({
      where: { status: { in: ["CONFIRMED", "TRAVELLING"] } },
      include: { customer: true, payments: true, vendorBookings: true },
      orderBy: { travelFrom: "asc" },
    }),
    db.booking.findMany({
      where: { createdAt: { gte: monthStart }, status: { not: "CANCELLED" } },
      include: { vendorBookings: true },
    }),
    db.vendorBooking.findMany({
      where: { status: { in: ["CONFIRMED", "REQUESTED"] }, dueOn: { lte: inDays(10) } },
      include: { vendor: true, booking: true },
      orderBy: { dueOn: "asc" },
      take: 8,
    }),
  ]);

  const owing = bookings
    .map((b) => ({
      booking: b,
      outstanding: b.sellPaise - b.payments.filter((p) => p.paidOn).reduce((s, p) => s + p.amountPaise, 0),
    }))
    .filter((b) => b.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, 8);

  const departing = bookings.filter((b) => b.travelFrom <= inDays(14)).slice(0, 8);

  const sold = monthBookings.reduce((s, b) => s + b.sellPaise, 0);
  const cost = monthBookings.reduce((s, b) => s + b.vendorBookings.reduce((v, x) => v + x.costPaise, 0), 0);
  const totalOutstanding = owing.reduce((s, b) => s + b.outstanding, 0);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">Dashboard</h1>
          <p className="text-[13px] text-[color:var(--color-muted)]">
            {now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <Link href="/enquiries?new=1" className="btn no-print">
          New enquiry
        </Link>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Sold this month" value={rupeesShort(sold)} sub={`${monthBookings.length} bookings`} />
        <Stat
          label="Margin this month"
          value={rupeesShort(sold - cost)}
          sub={sold ? `${Math.round(((sold - cost) / sold) * 100)}% of sales` : "—"}
        />
        <Stat label="Outstanding" value={rupeesShort(totalOutstanding)} sub={`${owing.length} bookings`} />
        <Stat label="Follow-ups due" value={String(followUps.length)} sub="today or overdue" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Follow up" empty={followUps.length === 0}>
          {followUps.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <Link href={`/enquiries/${e.id}`} className="text-[14px] font-medium hover:underline">
                  {e.customer.name}
                </Link>
                <div className="truncate text-[12px] text-[color:var(--color-muted)]">
                  {e.destination} · {e.code}
                </div>
              </div>
              <span className={`pill ${isOverdue(e.nextFollowUp) ? "bg-red-50 text-red-700" : tone(e.stage)}`}>
                {relative(e.nextFollowUp)}
              </span>
            </li>
          ))}
        </Panel>

        <Panel title="Money owed to us" empty={owing.length === 0}>
          {owing.map(({ booking, outstanding }) => (
            <li key={booking.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <Link href={`/bookings/${booking.id}`} className="text-[14px] font-medium hover:underline">
                  {booking.customer.name}
                </Link>
                <div className="truncate text-[12px] text-[color:var(--color-muted)]">
                  {booking.code} · travels {fmtDate(booking.travelFrom)}
                </div>
              </div>
              <span className="text-[14px] font-medium tabular-nums">{rupees(outstanding)}</span>
            </li>
          ))}
        </Panel>

        <Panel title="Departing soon" empty={departing.length === 0}>
          {departing.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <Link href={`/bookings/${b.id}`} className="text-[14px] font-medium hover:underline">
                  {b.customer.name}
                </Link>
                <div className="truncate text-[12px] text-[color:var(--color-muted)]">
                  {b.destination} · {b.code}
                </div>
              </div>
              <span className="pill bg-blue-50 text-blue-700">{relative(b.travelFrom)}</span>
            </li>
          ))}
        </Panel>

        <Panel title="Vendors to pay" empty={dueVendors.length === 0}>
          {dueVendors.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="text-[14px] font-medium">{v.vendor.name}</div>
                <div className="truncate text-[12px] text-[color:var(--color-muted)]">
                  {v.booking.code} · {v.description}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[14px] font-medium tabular-nums">{rupees(v.costPaise - v.paidPaise)}</div>
                <div className={`text-[11px] ${isOverdue(v.dueOn) ? "text-[color:var(--color-bad)]" : "text-[color:var(--color-muted)]"}`}>
                  {relative(v.dueOn)}
                </div>
              </div>
            </li>
          ))}
        </Panel>
      </div>
    </div>
  );
}
