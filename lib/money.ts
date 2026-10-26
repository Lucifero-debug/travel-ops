/*
  Money, in paise.

  Every amount in the database is an integer number of paise. Floating
  point money is how invoices end up one paisa out, and in a business
  where a customer pays in four instalments across three months, that
  error compounds and someone has to explain it.

  Rupee amounts only exist at the edges: parsed on input, formatted on
  output.
*/

/** 125000 -> "₹1,250" ; 125050 -> "₹1,250.50" */
export function rupees(paise: number, { decimals = false } = {}): string {
  const value = paise / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: decimals || value % 1 !== 0 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Indian shorthand for dashboards: 4550000 paise -> "₹45.5k", 1.2 Cr etc. */
export function rupeesShort(paise: number): string {
  const value = paise / 100;
  const abs = Math.abs(value);
  if (abs >= 1e7) return `₹${(value / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(value / 1e5).toFixed(2)} L`;
  if (abs >= 1e3) return `₹${(value / 1e3).toFixed(1)}k`;
  return `₹${value.toFixed(0)}`;
}

/** "1,25,000.50" or "125000.5" -> 12500050 paise. Throws on nonsense. */
export function toPaise(input: string | number): number {
  const text = String(input).replace(/[₹,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) throw new Error(`Not an amount: ${input}`);
  return Math.round(parseFloat(text) * 100);
}

/**
 * GST on a package, where the rate is a whole percent and the stored
 * subtotal is exclusive of tax. Rounding happens once, here, so the
 * invoice always adds up.
 */
export function gst(subtotalPaise: number, ratePercent: number) {
  const gstPaise = Math.round((subtotalPaise * ratePercent) / 100);
  return { gstPaise, totalPaise: subtotalPaise + gstPaise };
}

/** What a booking is worth and what is still owed. */
export function bookingMoney(args: {
  sellPaise: number;
  payments: { amountPaise: number; paidOn: Date | null }[];
  vendorCosts: { costPaise: number }[];
}) {
  const received = args.payments
    .filter((p) => p.paidOn)
    .reduce((sum, p) => sum + p.amountPaise, 0);
  const cost = args.vendorCosts.reduce((sum, v) => sum + v.costPaise, 0);
  const margin = args.sellPaise - cost;
  return {
    received,
    outstanding: args.sellPaise - received,
    cost,
    margin,
    marginPercent: args.sellPaise ? Math.round((margin / args.sellPaise) * 100) : 0,
  };
}
