import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { rupees } from "@/lib/money";
import { fmtDate, fmtRange, relative, isOverdue, tone } from "@/lib/format";
import { logActivity, setStage, setFollowUp, convertToBooking } from "../actions";

/*
  One enquiry: everything known about it, the timeline, and the three
  things an agent does here — log contact, move the stage, convert.
*/

export const dynamic = "force-dynamic";

const ymd = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : "");

export default async function EnquiryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const enquiry = await db.enquiry.findUnique({
    where: { id },
    include: { customer: true, owner: true, quotations: { orderBy: { createdAt: "desc" } }, booking: true },
  });
  if (!enquiry) notFound();

  const timeline = await db.activity.findMany({
    where: { enquiryId: id },
    orderBy: { createdAt: "desc" },
    include: { user: true },
    take: 50,
  });

  const closed = enquiry.stage === "CONVERTED" || enquiry.stage === "LOST";

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-semibold tracking-tight">{enquiry.customer.name}</h1>
            <span className={`pill ${tone(enquiry.stage)}`}>{enquiry.stage.toLowerCase()}</span>
          </div>
          <p className="text-[13px] text-[color:var(--color-muted)]">
            {enquiry.code} · {enquiry.customer.phone}
            {enquiry.customer.city ? ` · ${enquiry.customer.city}` : ""}
          </p>
        </div>
        <div className="no-print flex gap-2">
          <a
            className="btn-light"
            href={`https://wa.me/${enquiry.customer.phone.replace(/[^\d]/g, "")}`}
            target="_blank"
            rel="noreferrer"
          >
            WhatsApp
          </a>
          {enquiry.booking && (
            <Link className="btn" href={`/bookings/${enquiry.booking.id}`}>
              Open booking
            </Link>
          )}
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-5">
          <section className="card p-4">
            <h2 className="mb-3 text-[14px] font-semibold">The trip they want</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[14px]">
              <div><dt className="label">Destination</dt><dd>{enquiry.destination}</dd></div>
              <div><dt className="label">Travel</dt><dd>{fmtRange(enquiry.travelFrom, enquiry.travelTo)}</dd></div>
              <div>
                <dt className="label">Travellers</dt>
                <dd>{enquiry.adults} adults{enquiry.children ? `, ${enquiry.children} children` : ""}{enquiry.infants ? `, ${enquiry.infants} infants` : ""}</dd>
              </div>
              <div><dt className="label">Budget</dt><dd>{enquiry.budgetPaise ? rupees(enquiry.budgetPaise) : "Not said"}</dd></div>
              <div><dt className="label">Source</dt><dd>{enquiry.source.toLowerCase().replace("_", " ")}</dd></div>
              <div><dt className="label">Owner</dt><dd>{enquiry.owner?.name ?? "Unassigned"}</dd></div>
            </dl>
            {enquiry.requirements && (
              <p className="mt-4 rounded-md bg-[color:var(--color-paper)] p-3 text-[13px]">
                {enquiry.requirements}
              </p>
            )}
            {enquiry.lostReason && (
              <p className="mt-4 text-[13px] text-[color:var(--color-bad)]">Lost: {enquiry.lostReason}</p>
            )}
          </section>

          {!closed && (
            <section className="card p-4">
              <h2 className="mb-3 text-[14px] font-semibold">Confirm the booking</h2>
              <p className="mb-3 text-[13px] text-[color:var(--color-muted)]">
                The agreed price is copied onto the booking, so later changes here cannot alter it.
              </p>
              <form action={convertToBooking} className="grid gap-3 sm:grid-cols-4">
                <input type="hidden" name="enquiryId" value={enquiry.id} />
                <div>
                  <label className="label" htmlFor="travelFrom">From</label>
                  <input className="input" id="travelFrom" type="date" name="travelFrom" defaultValue={ymd(enquiry.travelFrom)} required />
                </div>
                <div>
                  <label className="label" htmlFor="travelTo">To</label>
                  <input className="input" id="travelTo" type="date" name="travelTo" defaultValue={ymd(enquiry.travelTo)} required />
                </div>
                <div>
                  <label className="label" htmlFor="sell">Agreed price (₹)</label>
                  <input className="input" id="sell" name="sell" placeholder="208000" required />
                </div>
                <div className="flex items-end">
                  <button className="btn w-full" type="submit">Confirm</button>
                </div>
              </form>
            </section>
          )}

          <section className="card">
            <h2 className="border-b border-[color:var(--color-line)] px-4 py-3 text-[14px] font-semibold">
              Timeline
            </h2>
            <form action={logActivity} className="flex flex-wrap gap-2 border-b border-[color:var(--color-line)] p-4">
              <input type="hidden" name="enquiryId" value={enquiry.id} />
              <select className="input w-32" name="kind" defaultValue="WHATSAPP" aria-label="Kind">
                <option value="WHATSAPP">WhatsApp</option>
                <option value="CALL">Call</option>
                <option value="EMAIL">Email</option>
                <option value="NOTE">Note</option>
              </select>
              <input className="input flex-1" name="body" placeholder="Sent the Bali quote with the villa option" required />
              <button className="btn" type="submit">Log</button>
            </form>
            <ul className="divide-y divide-[color:var(--color-line)]">
              {timeline.map((item) => (
                <li key={item.id} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px]">{item.body}</span>
                    <span className="shrink-0 text-[11px] text-[color:var(--color-muted)]">
                      {fmtDate(item.createdAt)}
                    </span>
                  </div>
                  <div className="text-[11px] text-[color:var(--color-muted)]">
                    {item.kind.toLowerCase().replace("_", " ")}
                    {item.user ? ` · ${item.user.name}` : ""}
                  </div>
                </li>
              ))}
              {timeline.length === 0 && (
                <li className="px-4 py-6 text-[13px] text-[color:var(--color-muted)]">Nothing logged yet.</li>
              )}
            </ul>
          </section>
        </div>

        <div className="space-y-5">
          <section className="card p-4">
            <h2 className="mb-3 text-[14px] font-semibold">Next follow-up</h2>
            <p className={`mb-3 text-[13px] ${isOverdue(enquiry.nextFollowUp) ? "text-[color:var(--color-bad)]" : "text-[color:var(--color-muted)]"}`}>
              {enquiry.nextFollowUp ? `${fmtDate(enquiry.nextFollowUp)} (${relative(enquiry.nextFollowUp)})` : "Not set, which is how enquiries go cold."}
            </p>
            <form action={setFollowUp} className="flex gap-2">
              <input type="hidden" name="enquiryId" value={enquiry.id} />
              <input className="input" type="date" name="nextFollowUp" defaultValue={ymd(enquiry.nextFollowUp)} aria-label="Next follow-up" />
              <button className="btn-light" type="submit">Set</button>
            </form>
          </section>

          <section className="card p-4">
            <h2 className="mb-3 text-[14px] font-semibold">Stage</h2>
            <form action={setStage} className="space-y-3">
              <input type="hidden" name="enquiryId" value={enquiry.id} />
              <select className="input" name="stage" defaultValue={enquiry.stage} aria-label="Stage">
                {["NEW", "CONTACTED", "QUOTED", "NEGOTIATING", "LOST"].map((s) => (
                  <option key={s} value={s}>{s.toLowerCase()}</option>
                ))}
              </select>
              <input className="input" name="lostReason" placeholder="If lost: why? (price, another agent, postponed)" />
              <button className="btn-light w-full" type="submit">Update</button>
            </form>
          </section>

          <section className="card p-4">
            <h2 className="mb-3 text-[14px] font-semibold">Quotations</h2>
            {enquiry.quotations.length === 0 ? (
              <p className="text-[13px] text-[color:var(--color-muted)]">
                None yet. The quotation builder is the next screen to build.
              </p>
            ) : (
              <ul className="space-y-2 text-[13px]">
                {enquiry.quotations.map((q) => (
                  <li key={q.id} className="flex items-center justify-between">
                    <span>{q.code} · v{q.version}</span>
                    <span className={`pill ${tone(q.status)}`}>{q.status.toLowerCase()}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
