import Link from "next/link";
import { db } from "@/lib/db";
import { rupees } from "@/lib/money";
import { fmtDate, relative, isOverdue, tone } from "@/lib/format";
import { createEnquiry } from "./actions";

/*
  The enquiry list: where an agent spends the day.

  Default view is "needs attention": open enquiries, oldest follow-up
  first. Everything else is a filter away, but the first screen should
  answer "who do I call now".
*/

export const dynamic = "force-dynamic";

const STAGES = ["NEW", "CONTACTED", "QUOTED", "NEGOTIATING", "CONVERTED", "LOST"] as const;

export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; new?: string; q?: string }>;
}) {
  const params = await searchParams;
  const stage = params.stage?.toUpperCase();
  const showForm = params.new === "1";

  const enquiries = await db.enquiry.findMany({
    where: {
      ...(stage && STAGES.includes(stage as (typeof STAGES)[number])
        ? { stage: stage as (typeof STAGES)[number] }
        : { stage: { notIn: ["CONVERTED", "LOST"] } }),
      ...(params.q
        ? {
            OR: [
              { destination: { contains: params.q, mode: "insensitive" as const } },
              { code: { contains: params.q, mode: "insensitive" as const } },
              { customer: { name: { contains: params.q, mode: "insensitive" as const } } },
              { customer: { phone: { contains: params.q } } },
            ],
          }
        : {}),
    },
    include: { customer: true, _count: { select: { quotations: true } } },
    orderBy: [{ nextFollowUp: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">Enquiries</h1>
          <p className="text-[13px] text-[color:var(--color-muted)]">
            {stage ? `Showing ${stage.toLowerCase()}` : "Open enquiries, soonest follow-up first"}
          </p>
        </div>
        <Link href={showForm ? "/enquiries" : "/enquiries?new=1"} className="btn">
          {showForm ? "Close" : "New enquiry"}
        </Link>
      </header>

      {showForm && (
        <form action={createEnquiry} className="card space-y-4 p-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="label" htmlFor="name">Customer name</label>
              <input className="input" id="name" name="name" required placeholder="Anil Kapoor" />
            </div>
            <div>
              <label className="label" htmlFor="phone">Phone</label>
              <input className="input" id="phone" name="phone" required placeholder="+91 98100 00000" />
            </div>
            <div>
              <label className="label" htmlFor="source">Came from</label>
              <select className="input" id="source" name="source" defaultValue="WHATSAPP">
                {["WHATSAPP", "PHONE", "WALK_IN", "INSTAGRAM", "WEBSITE", "REFERRAL", "AGENT", "OTHER"].map((s) => (
                  <option key={s} value={s}>{s.replace("_", " ").toLowerCase()}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="destination">Destination</label>
              <input className="input" id="destination" name="destination" required placeholder="Ladakh" />
            </div>
            <div>
              <label className="label" htmlFor="travelFrom">Travel from</label>
              <input className="input" id="travelFrom" name="travelFrom" type="date" />
            </div>
            <div>
              <label className="label" htmlFor="travelTo">Travel to</label>
              <input className="input" id="travelTo" name="travelTo" type="date" />
            </div>
            <div>
              <label className="label" htmlFor="adults">Adults</label>
              <input className="input" id="adults" name="adults" type="number" min={1} defaultValue={2} />
            </div>
            <div>
              <label className="label" htmlFor="children">Children</label>
              <input className="input" id="children" name="children" type="number" min={0} defaultValue={0} />
            </div>
            <div>
              <label className="label" htmlFor="budget">Budget (₹)</label>
              <input className="input" id="budget" name="budget" placeholder="150000" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="requirements">What they asked for</label>
            <textarea
              className="input h-20 py-2"
              id="requirements"
              name="requirements"
              placeholder="Honeymoon, pool villa for two nights, no early mornings"
            />
          </div>
          <button className="btn" type="submit">Save enquiry</button>
        </form>
      )}

      <nav className="no-print flex flex-wrap gap-2 text-[13px]">
        <Link href="/enquiries" className={`pill ${!stage ? "bg-[color:var(--color-ink)] text-white" : "bg-white"}`}>
          Open
        </Link>
        {STAGES.map((s) => (
          <Link
            key={s}
            href={`/enquiries?stage=${s.toLowerCase()}`}
            className={`pill ${stage === s ? "bg-[color:var(--color-ink)] text-white" : "bg-white"}`}
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
              <th className="th">Budget</th>
              <th className="th">Stage</th>
              <th className="th">Follow up</th>
            </tr>
          </thead>
          <tbody>
            {enquiries.map((e) => (
              <tr key={e.id} className="hover:bg-[color:var(--color-paper)]">
                <td className="td">
                  <Link href={`/enquiries/${e.id}`} className="font-medium hover:underline">
                    {e.customer.name}
                  </Link>
                  <div className="text-[12px] text-[color:var(--color-muted)]">{e.customer.phone}</div>
                </td>
                <td className="td">
                  {e.destination}
                  <div className="text-[12px] text-[color:var(--color-muted)]">
                    {e.code} · {e.adults}A{e.children ? ` ${e.children}C` : ""}
                    {e._count.quotations ? ` · ${e._count.quotations} quote(s)` : ""}
                  </div>
                </td>
                <td className="td whitespace-nowrap">{e.travelFrom ? fmtDate(e.travelFrom) : "—"}</td>
                <td className="td whitespace-nowrap tabular-nums">
                  {e.budgetPaise ? rupees(e.budgetPaise) : "—"}
                </td>
                <td className="td"><span className={`pill ${tone(e.stage)}`}>{e.stage.toLowerCase()}</span></td>
                <td className="td whitespace-nowrap">
                  <span className={isOverdue(e.nextFollowUp) ? "text-[color:var(--color-bad)]" : ""}>
                    {relative(e.nextFollowUp)}
                  </span>
                </td>
              </tr>
            ))}
            {enquiries.length === 0 && (
              <tr>
                <td className="td text-[color:var(--color-muted)]" colSpan={6}>
                  No enquiries here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
