"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { nextCode } from "@/lib/format";
import { toPaise, gst } from "@/lib/money";

/*
  Server actions for bookings: money in, money out, travellers, and
  issuing an invoice.
*/

const date = (value: FormDataEntryValue | null) =>
  value && String(value).trim() ? new Date(String(value)) : null;

export async function addPayment(formData: FormData) {
  const bookingId = String(formData.get("bookingId"));
  const amount = toPaise(String(formData.get("amount") ?? "0"));
  const kind = String(formData.get("kind") ?? "INSTALMENT") as "ADVANCE" | "INSTALMENT" | "BALANCE" | "REFUND";
  const mode = String(formData.get("mode") ?? "UPI") as "CASH" | "UPI" | "BANK_TRANSFER" | "CARD" | "CHEQUE" | "OTHER";
  const received = String(formData.get("received") ?? "yes") === "yes";

  if (amount === 0) throw new Error("Enter an amount");

  await db.payment.create({
    data: {
      bookingId,
      kind,
      mode,
      // A refund is stored negative, so every total is a plain sum.
      amountPaise: kind === "REFUND" ? -Math.abs(amount) : Math.abs(amount),
      paidOn: received ? (date(formData.get("on")) ?? new Date()) : null,
      dueOn: received ? null : date(formData.get("on")),
      reference: String(formData.get("reference") ?? "") || null,
    },
  });

  if (received) {
    await db.activity.create({
      data: { kind: "PAYMENT", body: `${kind.toLowerCase()} of ₹${(amount / 100).toLocaleString("en-IN")} by ${mode.toLowerCase().replace("_", " ")}.`, bookingId },
    });
  }
  revalidatePath(`/bookings/${bookingId}`);
}

export async function markPaymentReceived(formData: FormData) {
  const id = String(formData.get("paymentId"));
  const bookingId = String(formData.get("bookingId"));
  await db.payment.update({ where: { id }, data: { paidOn: new Date() } });
  revalidatePath(`/bookings/${bookingId}`);
}

export async function addVendorBooking(formData: FormData) {
  const bookingId = String(formData.get("bookingId"));
  const name = String(formData.get("vendorName") ?? "").trim();
  const type = String(formData.get("vendorType") ?? "HOTEL") as
    | "HOTEL" | "TRANSPORT" | "ACTIVITY" | "GUIDE" | "AIRLINE" | "TRAIN" | "INSURANCE" | "DMC" | "OTHER";
  if (!name) throw new Error("Vendor name is needed");

  // Vendors are reused across trips, so match by name before creating.
  const vendor =
    (await db.vendor.findFirst({ where: { name: { equals: name, mode: "insensitive" } } })) ??
    (await db.vendor.create({ data: { name, type } }));

  await db.vendorBooking.create({
    data: {
      bookingId,
      vendorId: vendor.id,
      description: String(formData.get("description") ?? "").trim() || "Service",
      costPaise: toPaise(String(formData.get("cost") ?? "0")),
      dueOn: date(formData.get("dueOn")),
      status: "PLANNED",
    },
  });
  revalidatePath(`/bookings/${bookingId}`);
}

export async function setVendorStatus(formData: FormData) {
  const id = String(formData.get("vendorBookingId"));
  const bookingId = String(formData.get("bookingId"));
  const status = String(formData.get("status")) as "PLANNED" | "REQUESTED" | "CONFIRMED" | "PAID" | "CANCELLED";

  const vendorBooking = await db.vendorBooking.findUnique({ where: { id } });
  await db.vendorBooking.update({
    where: { id },
    data: {
      status,
      // Marking paid records the full amount, which is what usually
      // happens; part payments are edited afterwards.
      paidPaise: status === "PAID" ? (vendorBooking?.costPaise ?? 0) : vendorBooking?.paidPaise,
    },
  });
  revalidatePath(`/bookings/${bookingId}`);
}

export async function addTraveller(formData: FormData) {
  const bookingId = String(formData.get("bookingId"));
  const fullName = String(formData.get("fullName") ?? "").trim();
  if (!fullName) throw new Error("Name as printed on the ID");

  await db.traveller.create({
    data: {
      bookingId,
      fullName,
      paxType: String(formData.get("paxType") ?? "ADULT") as "ADULT" | "CHILD" | "INFANT",
      idType: String(formData.get("idType") ?? "") || null,
      idNumber: String(formData.get("idNumber") ?? "") || null,
      phone: String(formData.get("phone") ?? "") || null,
    },
  });
  revalidatePath(`/bookings/${bookingId}`);
}

export async function setBookingStatus(formData: FormData) {
  const id = String(formData.get("bookingId"));
  const status = String(formData.get("status")) as "CONFIRMED" | "TRAVELLING" | "COMPLETED" | "CANCELLED";
  await db.booking.update({ where: { id }, data: { status } });
  await db.activity.create({ data: { kind: "STATUS_CHANGE", body: `Booking marked ${status.toLowerCase()}.`, bookingId: id } });
  revalidatePath(`/bookings/${id}`);
}

/**
 * Issues an invoice for the whole booking.
 *
 * The number is taken at issue time, not at draft time, because GST
 * invoice numbers must be sequential and unbroken. The amounts are stored
 * rather than computed on display, so a reissued invoice always shows
 * what the customer was actually sent.
 */
export async function issueInvoice(formData: FormData) {
  const bookingId = String(formData.get("bookingId"));
  const booking = await db.booking.findUnique({ where: { id: bookingId }, include: { customer: true } });
  if (!booking) throw new Error("Booking not found");

  const settings = await db.settings.findUnique({ where: { id: 1 } });
  const rate = Number(formData.get("gstRate") ?? settings?.defaultGstRate ?? 5);
  const { gstPaise, totalPaise } = gst(booking.sellPaise, rate);

  const invoice = await db.invoice.create({
    data: {
      number: await nextCode("INV"),
      bookingId,
      status: "ISSUED",
      subtotalPaise: booking.sellPaise,
      gstRate: rate,
      gstPaise,
      totalPaise,
      placeOfSupply: String(formData.get("placeOfSupply") ?? "") || booking.customer.city || null,
      customerGstin: String(formData.get("customerGstin") ?? "") || null,
      dueOn: date(formData.get("dueOn")),
      lines: {
        create: [
          {
            description: `${booking.destination} tour, ${booking.code}`,
            quantity: 1,
            ratePaise: booking.sellPaise,
            amountPaise: booking.sellPaise,
          },
        ],
      },
    },
  });

  redirect(`/invoices/${invoice.id}`);
}
