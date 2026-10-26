import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { rupees } from "@/lib/money";
import { fmtDate, fmtRange } from "@/lib/format";

/*
  A printable tax invoice.

  Printed from the browser rather than generated as a PDF: it is one less
  dependency, it always matches what is on screen, and "Save as PDF" is
  in every print dialog anyway.

  GST is split into CGST and SGST when the customer is in the same state
  as the operator, and charged as IGST when they are not. That rule is
  the one thing an accountant will check first.
*/

export const dynamic = "force-dynamic";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [invoice, settings] = await Promise.all([
    db.invoice.findUnique({
      where: { id },
      include: { lines: true, booking: { include: { customer: true, travellers: true } } },
    }),
    db.settings.findUnique({ where: { id: 1 } }),
  ]);
  if (!invoice) notFound();

  const sameState =
    !!settings?.address &&
    !!invoice.placeOfSupply &&
    settings.address.toLowerCase().includes(invoice.placeOfSupply.toLowerCase());
  const half = Math.round(invoice.gstPaise / 2);

  return (
    <div className="mx-auto max-w-[820px]">
      <div className="no-print mb-4 flex items-center justify-between">
        <a href={`/bookings/${invoice.bookingId}`} className="btn-light">Back to booking</a>
        {/*
          No print button: this is a server component, and the browser's
          own Ctrl+P already offers "Save as PDF". One less client
          component for something every browser does better.
        */}
        <span className="text-[13px] text-[color:var(--color-muted)]">
          Ctrl+P to print or save as PDF
        </span>
      </div>

      <article className="card p-8">
        <header className="flex items-start justify-between gap-6 border-b border-[color:var(--color-line)] pb-6">
          <div>
            <h1 className="text-[18px] font-semibold">{settings?.businessName ?? "Travel Ops"}</h1>
            {settings?.address && <p className="text-[12px] text-[color:var(--color-muted)]">{settings.address}</p>}
            <p className="text-[12px] text-[color:var(--color-muted)]">
              {settings?.phone} {settings?.email ? `· ${settings.email}` : ""}
            </p>
            {settings?.gstin && <p className="text-[12px]">GSTIN: {settings.gstin}</p>}
          </div>
          <div className="text-right">
            <div className="text-[13px] font-semibold uppercase tracking-wide">Tax invoice</div>
            <div className="mt-1 text-[14px]">{invoice.number}</div>
            <div className="text-[12px] text-[color:var(--color-muted)]">
              Issued {fmtDate(invoice.issuedOn)}
              {invoice.dueOn ? ` · due ${fmtDate(invoice.dueOn)}` : ""}
            </div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-6 py-6 text-[13px]">
          <div>
            <div className="label">Billed to</div>
            <div className="font-medium">{invoice.booking.customer.name}</div>
            <div className="text-[color:var(--color-muted)]">
              {invoice.booking.customer.phone}
              {invoice.booking.customer.city ? ` · ${invoice.booking.customer.city}` : ""}
            </div>
            {invoice.customerGstin && <div>GSTIN: {invoice.customerGstin}</div>}
          </div>
          <div>
            <div className="label">Trip</div>
            <div>{invoice.booking.destination}</div>
            <div className="text-[color:var(--color-muted)]">
              {fmtRange(invoice.booking.travelFrom, invoice.booking.travelTo)} ·{" "}
              {invoice.booking.travellers.length} travellers · {invoice.booking.code}
            </div>
            {invoice.placeOfSupply && (
              <div className="text-[color:var(--color-muted)]">Place of supply: {invoice.placeOfSupply}</div>
            )}
          </div>
        </section>

        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-y border-[color:var(--color-line)]">
              <th className="th">Description</th>
              <th className="th text-right">Qty</th>
              <th className="th text-right">Rate</th>
              <th className="th text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={line.id}>
                <td className="td">{line.description}</td>
                <td className="td text-right tabular-nums">{line.quantity}</td>
                <td className="td text-right tabular-nums">{rupees(line.ratePaise)}</td>
                <td className="td text-right tabular-nums">{rupees(line.amountPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 ml-auto w-full max-w-[320px] space-y-1.5 text-[13px]">
          <div className="flex justify-between">
            <span className="text-[color:var(--color-muted)]">Subtotal</span>
            <span className="tabular-nums">{rupees(invoice.subtotalPaise)}</span>
          </div>
          {sameState ? (
            <>
              <div className="flex justify-between">
                <span className="text-[color:var(--color-muted)]">CGST {invoice.gstRate / 2}%</span>
                <span className="tabular-nums">{rupees(half)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[color:var(--color-muted)]">SGST {invoice.gstRate / 2}%</span>
                <span className="tabular-nums">{rupees(invoice.gstPaise - half)}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between">
              <span className="text-[color:var(--color-muted)]">IGST {invoice.gstRate}%</span>
              <span className="tabular-nums">{rupees(invoice.gstPaise)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-[color:var(--color-line)] pt-2 text-[15px] font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{rupees(invoice.totalPaise)}</span>
          </div>
        </div>

        {settings?.terms && (
          <p className="mt-8 border-t border-[color:var(--color-line)] pt-4 text-[11px] text-[color:var(--color-muted)]">
            {settings.terms}
          </p>
        )}
      </article>
    </div>
  );
}
