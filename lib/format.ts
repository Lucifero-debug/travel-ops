import { db } from "./db";

/*
  Formatting and the small pieces of logic that more than one screen
  needs. Dates are shown the way Indian staff read them: 14 Mar, with the
  year only when it is not this one.
*/

export const fmtDate = (date: Date | null | undefined) => {
  if (!date) return "—";
  const thisYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(thisYear ? {} : { year: "numeric" }),
  });
};

export const fmtRange = (from: Date | null, to: Date | null) =>
  from && to ? `${fmtDate(from)} – ${fmtDate(to)}` : fmtDate(from ?? to);

/** "in 3 days", "today", "5 days ago": how staff actually think about dates. */
export function relative(date: Date | null | undefined) {
  if (!date) return "—";
  const days = Math.round((date.setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 864e5);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`;
}

export const isOverdue = (date: Date | null | undefined) =>
  !!date && date.setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);

/**
 * The next code in a series: ENQ-2026-0007.
 *
 * Counts existing rows for the year rather than keeping a counter table.
 * Fine at this scale, and it cannot drift out of step with reality. If
 * two people ever create a record in the same millisecond, the unique
 * index rejects the second and the action retries.
 */
export async function nextCode(prefix: "ENQ" | "QTN" | "TRP" | "INV"): Promise<string> {
  const year = new Date().getFullYear();
  const like = `${prefix}-${year}-%`;

  const count =
    prefix === "ENQ"
      ? await db.enquiry.count({ where: { code: { startsWith: `${prefix}-${year}-` } } })
      : prefix === "QTN"
        ? await db.quotation.count({ where: { code: { startsWith: `${prefix}-${year}-` } } })
        : prefix === "TRP"
          ? await db.booking.count({ where: { code: { startsWith: `${prefix}-${year}-` } } })
          : await db.invoice.count({ where: { number: { startsWith: `${prefix}-${year}-` } } });

  void like;
  return `${prefix}-${year}-${String(count + 1).padStart(4, "0")}`;
}

/** Colour for a stage or status pill. */
export function tone(value: string) {
  const map: Record<string, string> = {
    NEW: "bg-blue-50 text-blue-700",
    CONTACTED: "bg-blue-50 text-blue-700",
    QUOTED: "bg-amber-50 text-amber-700",
    NEGOTIATING: "bg-amber-50 text-amber-700",
    CONVERTED: "bg-green-50 text-green-700",
    LOST: "bg-neutral-100 text-neutral-600",
    CONFIRMED: "bg-green-50 text-green-700",
    TRAVELLING: "bg-blue-50 text-blue-700",
    COMPLETED: "bg-neutral-100 text-neutral-600",
    CANCELLED: "bg-red-50 text-red-700",
    PLANNED: "bg-neutral-100 text-neutral-600",
    REQUESTED: "bg-amber-50 text-amber-700",
    PAID: "bg-green-50 text-green-700",
    ISSUED: "bg-amber-50 text-amber-700",
    DRAFT: "bg-neutral-100 text-neutral-600",
  };
  return map[value] ?? "bg-neutral-100 text-neutral-600";
}
