import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { rupees, toPaise } from "@/lib/money";

/*
  Packages: the templates an operator sells again and again.

  Kept simple on purpose. The itinerary builder (reordering days, copying
  a package into a quotation) is the next screen; this one exists so
  packages can be created and read while that is built.
*/

export const dynamic = "force-dynamic";

async function createPackage(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  const destination = String(formData.get("destination") ?? "").trim();
  const nights = Number(formData.get("nights") ?? 0);
  const from = String(formData.get("fromPrice") ?? "").trim();
  if (!name || !destination) throw new Error("Name and destination are needed");

  await db.package.create({
    data: {
      name,
      destination,
      nights,
      summary: String(formData.get("summary") ?? "") || null,
      fromPricePaise: from ? toPaise(from) : null,
      // One empty day per night plus a departure day, so the itinerary
      // has somewhere to be written rather than starting from nothing.
      days: {
        create: Array.from({ length: Math.max(nights + 1, 1) }, (_, i) => ({
          dayNumber: i + 1,
          title: i === 0 ? "Arrival" : i === nights ? "Departure" : `Day ${i + 1}`,
        })),
      },
    },
  });
  revalidatePath("/packages");
}

export default async function PackagesPage() {
  const packages = await db.package.findMany({
    include: { days: { orderBy: { dayNumber: "asc" } }, _count: { select: { quotations: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-[20px] font-semibold tracking-tight">Packages</h1>
        <p className="text-[13px] text-[color:var(--color-muted)]">
          Templates to quote from. A quotation copies these days, so editing a package never changes a
          quote already sent.
        </p>
      </header>

      <form action={createPackage} className="card grid gap-3 p-4 sm:grid-cols-6">
        <input className="input sm:col-span-2" name="name" placeholder="Ladakh by road, 7 nights" required aria-label="Name" />
        <input className="input" name="destination" placeholder="Ladakh" required aria-label="Destination" />
        <input className="input" name="nights" type="number" min={1} max={60} defaultValue={5} aria-label="Nights" />
        <input className="input" name="fromPrice" placeholder="From ₹" aria-label="From price" />
        <button className="btn" type="submit">Add</button>
        <input className="input sm:col-span-6" name="summary" placeholder="One line a customer would read" aria-label="Summary" />
      </form>

      <div className="grid gap-5 md:grid-cols-2">
        {packages.map((p) => (
          <section key={p.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold">{p.name}</h2>
                <p className="text-[12px] text-[color:var(--color-muted)]">
                  {p.destination} · {p.nights} nights
                  {p._count.quotations ? ` · quoted ${p._count.quotations} times` : ""}
                </p>
              </div>
              {p.fromPricePaise && (
                <div className="text-right">
                  <div className="text-[12px] text-[color:var(--color-muted)]">from</div>
                  <div className="text-[15px] font-semibold tabular-nums">{rupees(p.fromPricePaise)}</div>
                </div>
              )}
            </div>
            {p.summary && <p className="mt-2 text-[13px] text-[color:var(--color-muted)]">{p.summary}</p>}
            {p.days.length > 0 && (
              <ol className="mt-3 space-y-1 border-t border-[color:var(--color-line)] pt-3 text-[13px]">
                {p.days.map((d) => (
                  <li key={d.id} className="flex gap-3">
                    <span className="w-12 shrink-0 text-[color:var(--color-muted)]">Day {d.dayNumber}</span>
                    <span>
                      {d.title}
                      {d.stayCity ? <span className="text-[color:var(--color-muted)]"> · {d.stayCity}</span> : null}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        ))}
        {packages.length === 0 && (
          <p className="text-[13px] text-[color:var(--color-muted)]">No packages yet.</p>
        )}
      </div>
    </div>
  );
}
