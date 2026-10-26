import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { rupees, bookingMoney } from "@/lib/money";
import { fmtDate, fmtRange, relative, isOverdue, tone } from "@/lib/format";
import {
  addPayment,
  addTraveller,
  addVendorBooking,
  issueInvoice,
  markPaymentReceived,
  setBookingStatus,
  setVendorStatus,
} from "../actions";

/*
  One booking: the operational heart of the product.

  Four things live here, and they are the four things an operator chases:
  who is travelling, what they have paid, what we owe vendors, and what
  this trip actually earns.
*/

export const dynamic = "force-dynamic";

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const booking = await db.booking.findUnique({
    where: { id },
    include: {
      customer: true,
      travellers: true,
      payments: { orderBy: [{ paidOn: "asc" }, { dueOn: "asc" }] },
      vendorBookings: { include: { vendor: true } },
      invoices: { orderBy: { issuedOn: "desc" } },
      enquiry: true,
    },
  });
  if (!booking) notFound();

  const money = bookingMoney({
    sellPaise: booking.sellPaise,
    payments: booking.payments,
    vendorCosts: booking.vendorBookings,
  });
  const vendorOwed = booking.vendorBookings.reduce((s, v) => s + (v.costPaise - v.paidPaise), 0);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-semibold tracking-tight">{booking.customer.name}</h1>
            <span className={`pill ${tone(booking.status)}`}>{booking.status.toLowerCase()}</span>
          </div>
          <p className="text-[13px] text-[color:var(--color-muted)]">
            {booking.code} · {booking.destination} · {fmtRange(booking.travelFrom, booking.travelTo)} ·{" "}
            {relative(booking.travelFrom)}
          </p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <a
            className="btn-light"
            href={`https://wa.me/${booking.customer.phone.replace(/[^\d]/g, "")}`}
            target="_blank"
            rel="noreferrer"
          >
            WhatsApp
          </a>
          {booking.enquiry && (
            <Link className="btn-light" href={`/enquiries/${booking.enquiry.id}`}>
              Enquiry
            </Link>
          )}
          <form action={setBookingStatus} className="flex gap-2">
            <input type="hidden" name="bookingId" value={booking.id} />
            <select className="input w-36" name="status" defaultValue={booking.status} aria-label="Status">
              {["CONFIRMED", "TRAVELLING", "COMPLETED", "CANCELLED"].map((s) => (
                <option key={s} value={s}>{s.toLowerCase()}</option>
              ))}
            </select>
            <button className="btn-light" type="submit">Set</button>
          </form>
        </div>
      </header>

      {/* The numbers that decide whether this trip was worth doing. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Sell price", value: rupees(booking.sellPaise) },
          { label: "Received", value: rupees(money.received), sub: money.outstanding > 0 ? `${rupees(money.outstanding)} outstanding` : "paid in full" },
          { label: "Vendor cost", value: rupees(money.cost), sub: vendorOwed > 0 ? `${rupees(vendorOwed)} still to pay` : "all paid" },
          { label: "Margin", value: rupees(money.margin), sub: `${money.marginPercent}% of sales` },
        ].map((stat) => (
          <div key={stat.label} className="card p-4">
            <div className="text-[12px] text-[color:var(--color-muted)]">{stat.label}</div>
            <div className="mt-1 text-[20px] font-semibold tabular-nums tracking-tight">{stat.value}</div>
            {stat.sub && <div className="mt-0.5 text-[12px] text-[color:var(--color-muted)]">{stat.sub}</div>}
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Money in */}
        <section className="card">
          <h2 className="border-b border-[color:var(--color-line)] px-4 py-3 text-[14px] font-semibold">Payments</h2>
          <ul className="divide-y divide-[color:var(--color-line)]">
            {booking.payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="text-[14px] tabular-nums">{rupees(p.amountPaise)}</div>
                  <div className="text-[12px] text-[color:var(--color-muted)]">
                    {p.kind.toLowerCase()} · {p.mode.toLowerCase().replace("_", " ")}
                    {p.reference ? ` · ${p.reference}` : ""}
                  </div>
                </div>
                {p.paidOn ? (
                  <span className="pill bg-green-50 text-green-700">{fmtDate(p.paidOn)}</span>
                ) : (
                  <form action={markPaymentReceived} className="flex items-center gap-2">
                    <input type="hidden" name="paymentId" value={p.id} />
                    <input type="hidden" name="bookingId" value={booking.id} />
                    <span className={`pill ${isOverdue(p.dueOn) ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                      due {relative(p.dueOn)}
                    </span>
                    <button className="btn-light h-8 px-3 text-[12px]" type="submit">Received</button>
                  </form>
                )}
              </li>
            ))}
            {booking.payments.length === 0 && (
              <li className="px-4 py-6 text-[13px] text-[color:var(--color-muted)]">Nothing recorded yet.</li>
            )}
          </ul>
          <form action={addPayment} className="grid gap-2 border-t border-[color:var(--color-line)] p-4 sm:grid-cols-6">
            <input type="hidden" name="bookingId" value={booking.id} />
            <input className="input sm:col-span-2" name="amount" placeholder="Amount ₹" required aria-label="Amount" />
            <select className="input" name="kind" defaultValue="INSTALMENT" aria-label="Kind">
              {["ADVANCE", "INSTALMENT", "BALANCE", "REFUND"].map((k) => (
                <option key={k} value={k}>{k.toLowerCase()}</option>
              ))}
            </select>
            <select className="input" name="mode" defaultValue="UPI" aria-label="Mode">
              {["UPI", "CASH", "BANK_TRANSFER", "CARD", "CHEQUE"].map((m) => (
                <option key={m} value={m}>{m.toLowerCase().replace("_", " ")}</option>
              ))}
            </select>
            <select className="input" name="received" defaultValue="yes" aria-label="Received?">
              <option value="yes">received</option>
              <option value="no">due</option>
            </select>
            <button className="btn" type="submit">Add</button>
          </form>
        </section>

        {/* Money out */}
        <section className="card">
          <h2 className="border-b border-[color:var(--color-line)] px-4 py-3 text-[14px] font-semibold">
            Vendors and costs
          </h2>
          <ul className="divide-y divide-[color:var(--color-line)]">
            {booking.vendorBookings.map((v) => (
              <li key={v.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[14px] font-medium">{v.vendor.name}</div>
                    <div className="text-[12px] text-[color:var(--color-muted)]">{v.description}</div>
                    {v.confirmationNo && (
                      <div className="text-[12px] text-[color:var(--color-muted)]">Ref {v.confirmationNo}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-[14px] tabular-nums">{rupees(v.costPaise)}</div>
                    {v.dueOn && (
                      <div className={`text-[11px] ${isOverdue(v.dueOn) && v.status !== "PAID" ? "text-[color:var(--color-bad)]" : "text-[color:var(--color-muted)]"}`}>
                        pay {relative(v.dueOn)}
                      </div>
                    )}
                  </div>
                </div>
                <form action={setVendorStatus} className="mt-2 flex items-center gap-2">
                  <input type="hidden" name="vendorBookingId" value={v.id} />
                  <input type="hidden" name="bookingId" value={booking.id} />
                  <select className="input h-8 w-36 text-[12px]" name="status" defaultValue={v.status} aria-label="Vendor status">
                    {["PLANNED", "REQUESTED", "CONFIRMED", "PAID", "CANCELLED"].map((s) => (
                      <option key={s} value={s}>{s.toLowerCase()}</option>
                    ))}
                  </select>
                  <button className="btn-light h-8 px-3 text-[12px]" type="submit">Update</button>
                  <span className={`pill ${tone(v.status)}`}>{v.status.toLowerCase()}</span>
                </form>
              </li>
            ))}
            {booking.vendorBookings.length === 0 && (
              <li className="px-4 py-6 text-[13px] text-[color:var(--color-muted)]">
                No costs yet, so margin is showing as the full sell price.
              </li>
            )}
          </ul>
          <form action={addVendorBooking} className="grid gap-2 border-t border-[color:var(--color-line)] p-4 sm:grid-cols-6">
            <input type="hidden" name="bookingId" value={booking.id} />
            <input className="input sm:col-span-2" name="vendorName" placeholder="Vendor" required aria-label="Vendor" />
            <select className="input" name="vendorType" defaultValue="HOTEL" aria-label="Type">
              {["HOTEL", "TRANSPORT", "ACTIVITY", "GUIDE", "AIRLINE", "DMC", "OTHER"].map((t) => (
                <option key={t} value={t}>{t.toLowerCase()}</option>
              ))}
            </select>
            <input className="input sm:col-span-2" name="description" placeholder="2 rooms, 3 nights, BB" aria-label="Description" />
            <input className="input" name="cost" placeholder="Cost ₹" required aria-label="Cost" />
            <input className="input sm:col-span-2" name="dueOn" type="date" aria-label="Pay by" />
            <button className="btn sm:col-span-2" type="submit">Add cost</button>
          </form>
        </section>

        {/* Who is going */}
        <section className="card">
          <h2 className="border-b border-[color:var(--color-line)] px-4 py-3 text-[14px] font-semibold">
            Travellers
            <span className="ml-2 font-normal text-[color:var(--color-muted)]">names as printed on ID</span>
          </h2>
          <ul className="divide-y divide-[color:var(--color-line)]">
            {booking.travellers.map((t) => (
              <li key={t.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="text-[14px]">{t.fullName}</div>
                  <div className="text-[12px] text-[color:var(--color-muted)]">
                    {t.paxType.toLowerCase()}
                    {t.idType ? ` · ${t.idType}${t.idNumber ? ` ${t.idNumber}` : ""}` : " · no ID on file"}
                  </div>
                </div>
                {!t.idNumber && <span className="pill bg-amber-50 text-amber-700">ID pending</span>}
              </li>
            ))}
          </ul>
          <form action={addTraveller} className="grid gap-2 border-t border-[color:var(--color-line)] p-4 sm:grid-cols-6">
            <input type="hidden" name="bookingId" value={booking.id} />
            <input className="input sm:col-span-2" name="fullName" placeholder="Full name" required aria-label="Full name" />
            <select className="input" name="paxType" defaultValue="ADULT" aria-label="Type">
              {["ADULT", "CHILD", "INFANT"].map((t) => (
                <option key={t} value={t}>{t.toLowerCase()}</option>
              ))}
            </select>
            <input className="input" name="idType" placeholder="Aadhaar" aria-label="ID type" />
            <input className="input" name="idNumber" placeholder="ID number" aria-label="ID number" />
            <button className="btn" type="submit">Add</button>
          </form>
        </section>

        {/* Billing */}
        <section className="card">
          <h2 className="border-b border-[color:var(--color-line)] px-4 py-3 text-[14px] font-semibold">Invoices</h2>
          <ul className="divide-y divide-[color:var(--color-line)]">
            {booking.invoices.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <Link href={`/invoices/${inv.id}`} className="text-[14px] font-medium hover:underline">
                    {inv.number}
                  </Link>
                  <div className="text-[12px] text-[color:var(--color-muted)]">
                    {fmtDate(inv.issuedOn)} · GST {inv.gstRate}%
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[14px] tabular-nums">{rupees(inv.totalPaise)}</div>
                  <span className={`pill ${tone(inv.status)}`}>{inv.status.toLowerCase()}</span>
                </div>
              </li>
            ))}
            {booking.invoices.length === 0 && (
              <li className="px-4 py-6 text-[13px] text-[color:var(--color-muted)]">None issued.</li>
            )}
          </ul>
          <form action={issueInvoice} className="grid gap-2 border-t border-[color:var(--color-line)] p-4 sm:grid-cols-4">
            <input type="hidden" name="bookingId" value={booking.id} />
            <input className="input" name="gstRate" type="number" min={0} max={28} defaultValue={5} aria-label="GST %" />
            <input className="input" name="placeOfSupply" placeholder="Place of supply" defaultValue={booking.customer.city ?? ""} aria-label="Place of supply" />
            <input className="input" name="dueOn" type="date" aria-label="Due date" />
            <button className="btn" type="submit">Issue invoice</button>
          </form>
        </section>
      </div>
    </div>
  );
}
