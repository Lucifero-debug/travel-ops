"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { nextCode } from "@/lib/format";
import { toPaise } from "@/lib/money";

/*
  Server actions for enquiries.

  Validation happens here, at the boundary, not in the form: a form can be
  bypassed, a server action cannot. Everything that changes a record also
  writes an Activity row, because the timeline is what makes staff trust
  the system.
*/

const optionalDate = (value: FormDataEntryValue | null) =>
  value && String(value).trim() ? new Date(String(value)) : null;

const createSchema = z.object({
  name: z.string().min(2, "Name is too short"),
  phone: z.string().min(8, "Phone looks wrong"),
  email: z.string().email().optional().or(z.literal("")),
  city: z.string().optional(),
  destination: z.string().min(2, "Where do they want to go?"),
  source: z.enum(["WALK_IN", "PHONE", "WHATSAPP", "WEBSITE", "INSTAGRAM", "REFERRAL", "AGENT", "OTHER"]),
  adults: z.coerce.number().int().min(1).max(60),
  children: z.coerce.number().int().min(0).max(40),
  budget: z.string().optional(),
  requirements: z.string().optional(),
});

export async function createEnquiry(formData: FormData) {
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    // Surfaced by the form's error boundary; good enough until there is
    // a field-level error UI.
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }
  const data = parsed.data;

  // One customer per phone number: the same person enquires repeatedly,
  // and their history is the most useful thing an agent can have.
  const customer =
    (await db.customer.findFirst({ where: { phone: data.phone } })) ??
    (await db.customer.create({
      data: { name: data.name, phone: data.phone, email: data.email || null, city: data.city || null },
    }));

  const enquiry = await db.enquiry.create({
    data: {
      code: await nextCode("ENQ"),
      customerId: customer.id,
      source: data.source,
      destination: data.destination,
      travelFrom: optionalDate(formData.get("travelFrom")),
      travelTo: optionalDate(formData.get("travelTo")),
      adults: data.adults,
      children: data.children,
      budgetPaise: data.budget ? toPaise(data.budget) : null,
      requirements: data.requirements || null,
      // Default to tomorrow: an enquiry with no follow-up date is how
      // enquiries go cold.
      nextFollowUp: new Date(Date.now() + 864e5),
    },
  });

  await db.activity.create({
    data: { kind: "SYSTEM", body: `Enquiry created from ${data.source.toLowerCase().replace("_", " ")}.`, enquiryId: enquiry.id },
  });

  redirect(`/enquiries/${enquiry.id}`);
}

export async function logActivity(formData: FormData) {
  const enquiryId = String(formData.get("enquiryId"));
  const body = String(formData.get("body") ?? "").trim();
  const kind = String(formData.get("kind") ?? "NOTE") as "NOTE" | "CALL" | "WHATSAPP" | "EMAIL";
  if (!body) return;

  await db.activity.create({ data: { kind, body, enquiryId } });

  // Logging contact without setting the next one is how follow-ups are
  // lost, so nudge the date forward by three days unless one is set.
  const enquiry = await db.enquiry.findUnique({ where: { id: enquiryId } });
  if (enquiry && (!enquiry.nextFollowUp || enquiry.nextFollowUp < new Date())) {
    await db.enquiry.update({
      where: { id: enquiryId },
      data: { nextFollowUp: new Date(Date.now() + 3 * 864e5) },
    });
  }

  revalidatePath(`/enquiries/${enquiryId}`);
}

export async function setStage(formData: FormData) {
  const id = String(formData.get("enquiryId"));
  const stage = String(formData.get("stage")) as
    | "NEW" | "CONTACTED" | "QUOTED" | "NEGOTIATING" | "CONVERTED" | "LOST";
  const lostReason = String(formData.get("lostReason") ?? "").trim();

  await db.enquiry.update({
    where: { id },
    data: { stage, lostReason: stage === "LOST" ? lostReason || "Not given" : null },
  });
  await db.activity.create({
    data: {
      kind: "STATUS_CHANGE",
      body: stage === "LOST" ? `Marked lost: ${lostReason || "no reason given"}.` : `Moved to ${stage.toLowerCase()}.`,
      enquiryId: id,
    },
  });
  revalidatePath(`/enquiries/${id}`);
}

export async function setFollowUp(formData: FormData) {
  const id = String(formData.get("enquiryId"));
  const date = optionalDate(formData.get("nextFollowUp"));
  await db.enquiry.update({ where: { id }, data: { nextFollowUp: date } });
  revalidatePath(`/enquiries/${id}`);
}

/**
 * Turns an enquiry into a booking: the moment money starts.
 *
 * The sell price is copied in here and never read back from the enquiry,
 * so later edits cannot change what was agreed.
 */
export async function convertToBooking(formData: FormData) {
  const id = String(formData.get("enquiryId"));
  const sell = toPaise(String(formData.get("sell") ?? "0"));
  const travelFrom = optionalDate(formData.get("travelFrom"));
  const travelTo = optionalDate(formData.get("travelTo"));

  const enquiry = await db.enquiry.findUnique({ where: { id }, include: { customer: true } });
  if (!enquiry) throw new Error("Enquiry not found");
  if (!travelFrom || !travelTo) throw new Error("Travel dates are needed to confirm a booking");
  if (sell <= 0) throw new Error("Enter the agreed price");

  const booking = await db.booking.create({
    data: {
      code: await nextCode("TRP"),
      customerId: enquiry.customerId,
      enquiryId: enquiry.id,
      destination: enquiry.destination,
      travelFrom,
      travelTo,
      sellPaise: sell,
      ownerId: enquiry.ownerId,
      travellers: {
        // Seed one traveller from the customer; names get corrected
        // against IDs later, which is why they live on the booking.
        create: [{ fullName: enquiry.customer.name, paxType: "ADULT", customerId: enquiry.customerId }],
      },
    },
  });

  await db.enquiry.update({ where: { id }, data: { stage: "CONVERTED", nextFollowUp: null } });
  await db.activity.createMany({
    data: [
      { kind: "STATUS_CHANGE", body: `Converted to booking ${booking.code}.`, enquiryId: id },
      { kind: "SYSTEM", body: `Booking created from ${enquiry.code}.`, bookingId: booking.id },
    ],
  });

  redirect(`/bookings/${booking.id}`);
}
