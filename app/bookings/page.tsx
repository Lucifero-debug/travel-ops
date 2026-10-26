import Link from "next/link";
import { db } from "@/lib/db";
import { rupees } from "@/lib/money";
import { fmtRange, relative, tone } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter = status?.toUpperCase();

  const bookings = await db.booking.findMany({
    where: filter && filter !== "ALL" ? { status: filter as "CONFIRMED" } : {},
    include: { customer: true, payments: true, vendorBookings: true },
    orderBy: { travelFrom: "asc" },
    take: 100,
  });

  const row = (b: (typeof bookings)[number]) => {
    const received = b.payments.filter((p) => p.paidOn).reduce((s, p) => s + p.amountPaise, 0);
    const cost = b.vendorBookings.reduce((s, v) => s + v.costPaise, 0);
    return { received, outstanding: b.sellPaise - received, margin: b.sellPaise - cost };
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-[20px] font-semibold tracking-tight">Bookings</h1>
        <p className="text-[13px] text-[color:var(--color-muted)]">Soonest departure first</p>
      </header>

      <nav className="no-print flex flex-wrap gap-2">
        {["ALL", "CONFIRMED", "TRAVELLING", "COMPLETED", "CANCELLED"].map((s) => (
          <Link
            key={s}
            href={s === "ALL" ? "/bookings" : `/bookings?status=${s.toLowerCase()}`}
            className={`pill ${(filter ?? "ALL") === s ? "bg-[color:var(--color-ink)] text-white" : "bg-white"}`}
          >
            {s.toLowerCase()}
          </Link>
        ))}
      </nav>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-[color:var(--color-paper)]">
            <tr>
              <th className="th">Customer</th>
              <th className="th">Trip</th>
              <th className="th">Travel</th>
              <th className="th text-right">Sell</th>
              <th className="th text-right">Outstanding</th>
              <th className="th text-right">Margin</th>
              <th className="th">Status</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => {
              const money = row(b);
              return (
                <tr key={b.id} className="hover:bg-[color:var(--color-paper)]">
                  <td className="td">
                    <Link href={`/bookings/${b.id}`} className="font-medium hover:underline">
                      {b.customer.name}
                    </Link>
                    <div className="text-[12px] text-[color:var(--color-muted)]">{b.code}</div>
                  </td>
                  <td className="td">{b.destination}</td>
                  <td className="td whitespace-nowrap">
                    {fmtRange(b.travelFrom, b.travelTo)}
                    <div className="text-[12px] text-[color:var(--color-muted)]">{relative(b.travelFrom)}</div>
                  </td>
                  <td className="td text-right tabular-nums">{rupees(b.sellPaise)}</td>
                  <td className={`td text-right tabular-nums ${money.outstanding > 0 ? "text-[color:var(--color-bad)]" : ""}`}>
                    {money.outstanding > 0 ? rupees(money.outstanding) : "paid"}
                  </td>
                  <td className="td text-right tabular-nums">{rupees(money.margin)}</td>
                  <td className="td"><span className={`pill ${tone(b.status)}`}>{b.status.toLowerCase()}</span></td>
                </tr>
              );
            })}
            {bookings.length === 0 && (
              <tr>
                <td className="td text-[color:var(--color-muted)]" colSpan={7}>
                  No bookings yet. Convert an enquiry to create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
