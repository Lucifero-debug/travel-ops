import { db } from "../lib/db.js";

/*
  Seed data: one operator, a few packages, and a realistic spread of
  enquiries and bookings so every screen has something to show.

  Run with `npm run db:seed`. Safe to run repeatedly: it clears first.
*/

const day = (offset: number) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date;
};
const lakh = (n: number) => Math.round(n * 100000 * 100); // lakhs -> paise

async function main() {
  // Order matters: children before parents.
  await db.$transaction([
    db.activity.deleteMany(),
    db.reminder.deleteMany(),
    db.document.deleteMany(),
    db.cancellation.deleteMany(),
    db.invoiceLine.deleteMany(),
    db.invoice.deleteMany(),
    db.payment.deleteMany(),
    db.vendorBooking.deleteMany(),
    db.traveller.deleteMany(),
    db.booking.deleteMany(),
    db.quotationDay.deleteMany(),
    db.quotation.deleteMany(),
    db.enquiry.deleteMany(),
    db.packageDay.deleteMany(),
    db.package.deleteMany(),
    db.vendor.deleteMany(),
    db.customer.deleteMany(),
    db.user.deleteMany(),
    db.settings.deleteMany(),
  ]);

  await db.settings.create({
    data: {
      id: 1,
      businessName: "Sahyadri Journeys",
      address: "212, Rajouri Garden, New Delhi 110027",
      phone: "+91 98100 00000",
      email: "hello@sahyadrijourneys.example",
      gstin: "07AAACS0000A1Z5",
      defaultGstRate: 5,
      terms: "50% advance to confirm. Balance 15 days before departure.",
    },
  });

  const [owner, agent] = await Promise.all([
    db.user.create({
      data: { name: "Meera Shah", email: "meera@example.com", role: "OWNER", phone: "+91 98100 00001" },
    }),
    db.user.create({
      data: { name: "Rohit Verma", email: "rohit@example.com", role: "AGENT", phone: "+91 98100 00002" },
    }),
  ]);

  const [ladakh, bali, kerala] = await Promise.all([
    db.package.create({
      data: {
        name: "Ladakh by road, 7 nights",
        destination: "Ladakh",
        nights: 7,
        summary: "Leh, Nubra and Pangong, with two acclimatisation days.",
        fromPricePaise: lakh(0.42),
        days: {
          create: [
            { dayNumber: 1, title: "Arrive in Leh, rest", stayCity: "Leh", meals: "D" },
            { dayNumber: 2, title: "Leh monasteries and market", stayCity: "Leh", meals: "B,D" },
            { dayNumber: 3, title: "Drive to Nubra over Khardung La", stayCity: "Nubra", meals: "B,D" },
            { dayNumber: 4, title: "Nubra: dunes and Diskit", stayCity: "Nubra", meals: "B,D" },
            { dayNumber: 5, title: "Drive to Pangong", stayCity: "Pangong", meals: "B,D" },
            { dayNumber: 6, title: "Pangong to Leh", stayCity: "Leh", meals: "B,D" },
            { dayNumber: 7, title: "Leh at leisure", stayCity: "Leh", meals: "B" },
          ],
        },
      },
    }),
    db.package.create({
      data: {
        name: "Bali, 5 nights",
        destination: "Bali",
        nights: 5,
        summary: "Ubud and Seminyak, with a day in Nusa Penida.",
        fromPricePaise: lakh(0.68),
        days: {
          create: [
            { dayNumber: 1, title: "Arrive Denpasar, transfer to Ubud", stayCity: "Ubud", meals: "-" },
            { dayNumber: 2, title: "Ubud: terraces, temple, market", stayCity: "Ubud", meals: "B" },
            { dayNumber: 3, title: "Nusa Penida day trip", stayCity: "Ubud", meals: "B,L" },
            { dayNumber: 4, title: "Transfer to Seminyak", stayCity: "Seminyak", meals: "B" },
            { dayNumber: 5, title: "Seminyak at leisure", stayCity: "Seminyak", meals: "B" },
          ],
        },
      },
    }),
    db.package.create({
      data: {
        name: "Kerala backwaters, 4 nights",
        destination: "Kerala",
        nights: 4,
        summary: "Munnar, Alleppey houseboat and Kochi.",
        fromPricePaise: lakh(0.31),
      },
    }),
  ]);

  const [hotelLeh, transportLeh, dmcBali] = await Promise.all([
    db.vendor.create({ data: { name: "Hotel Lotus, Leh", type: "HOTEL", city: "Leh", phone: "+91 90000 00011" } }),
    db.vendor.create({ data: { name: "Stanzin Taxi Union", type: "TRANSPORT", city: "Leh", phone: "+91 90000 00012" } }),
    db.vendor.create({ data: { name: "Bali Sunrise DMC", type: "DMC", city: "Denpasar", email: "ops@balisunrise.example" } }),
  ]);

  // Enquiries across the pipeline, including ones that went nowhere.
  const customers = await Promise.all(
    [
      { name: "Anil Kapoor", phone: "+91 99100 11111", city: "Delhi" },
      { name: "Sneha Rao", phone: "+91 99100 22222", city: "Gurugram" },
      { name: "Imran Qureshi", phone: "+91 99100 33333", city: "Noida" },
      { name: "Divya Menon", phone: "+91 99100 44444", city: "Delhi" },
    ].map((data) => db.customer.create({ data })),
  );

  await db.enquiry.create({
    data: {
      code: "ENQ-2026-0001",
      customerId: customers[1].id,
      source: "INSTAGRAM",
      stage: "QUOTED",
      destination: "Bali",
      travelFrom: day(45),
      travelTo: day(50),
      nights: 5,
      adults: 2,
      budgetPaise: lakh(1.5),
      requirements: "Honeymoon, pool villa for at least two nights.",
      nextFollowUp: day(1),
      ownerId: agent.id,
    },
  });

  await db.enquiry.create({
    data: {
      code: "ENQ-2026-0002",
      customerId: customers[2].id,
      source: "WHATSAPP",
      stage: "LOST",
      destination: "Ladakh",
      adults: 4,
      budgetPaise: lakh(1.2),
      lostReason: "Went with a cheaper operator",
      ownerId: agent.id,
    },
  });

  const liveEnquiry = await db.enquiry.create({
    data: {
      code: "ENQ-2026-0003",
      customerId: customers[0].id,
      source: "REFERRAL",
      stage: "CONVERTED",
      destination: "Ladakh",
      travelFrom: day(20),
      travelTo: day(27),
      nights: 7,
      adults: 4,
      ownerId: owner.id,
    },
  });

  const quotation = await db.quotation.create({
    data: {
      code: "QTN-2026-0003",
      enquiryId: liveEnquiry.id,
      packageId: ladakh.id,
      status: "ACCEPTED",
      title: "Ladakh by road, 7 nights, 4 adults",
      perAdultPaise: lakh(0.52),
      perChildPaise: 0,
      adults: 4,
      children: 0,
      inclusions: "Hotels on twin sharing, breakfast and dinner, Innova with driver, inner line permits.",
      exclusions: "Flights, lunches, oxygen cylinders, anything personal.",
      validUntil: day(10),
    },
  });

  const booking = await db.booking.create({
    data: {
      code: "TRP-2026-0003",
      customerId: customers[0].id,
      enquiryId: liveEnquiry.id,
      quotationId: quotation.id,
      destination: "Ladakh",
      travelFrom: day(20),
      travelTo: day(27),
      sellPaise: lakh(2.08),
      ownerId: owner.id,
      travellers: {
        create: [
          { fullName: "Anil Kapoor", paxType: "ADULT", idType: "Aadhaar", idNumber: "XXXX XXXX 1234" },
          { fullName: "Rekha Kapoor", paxType: "ADULT", idType: "Aadhaar" },
          { fullName: "Varun Kapoor", paxType: "ADULT" },
          { fullName: "Nisha Kapoor", paxType: "ADULT" },
        ],
      },
      payments: {
        create: [
          { kind: "ADVANCE", mode: "UPI", amountPaise: lakh(1.0), paidOn: day(-6), reference: "UPI/4471" },
        {
  kind: "BALANCE",
  mode: "BANK_TRANSFER",
  amountPaise: lakh(1.08),
  dueOn: day(5)
},
        ],
      },
      vendorBookings: {
        create: [
          {
            vendorId: hotelLeh.id,
            status: "CONFIRMED",
            description: "2 rooms, 4 nights, breakfast and dinner",
            costPaise: lakh(0.56),
            paidPaise: lakh(0.2),
            dueOn: day(12),
            confirmationNo: "LOT-99812",
          },
          {
            vendorId: transportLeh.id,
            status: "CONFIRMED",
            description: "Innova Crysta, 7 days, including Khardung La and Pangong",
            costPaise: lakh(0.63),
            dueOn: day(18),
          },
        ],
      },
    },
  });

  await db.invoice.create({
    data: {
      number: "INV-2026-0007",
      bookingId: booking.id,
      status: "ISSUED",
      subtotalPaise: lakh(2.08),
      gstRate: 5,
      gstPaise: Math.round(lakh(2.08) * 0.05),
      totalPaise: lakh(2.08) + Math.round(lakh(2.08) * 0.05),
      placeOfSupply: "Delhi",
      dueOn: day(5),
      lines: {
        create: [
          {
            description: "Ladakh by road, 7 nights, 4 adults",
            quantity: 4,
            ratePaise: lakh(0.52),
            amountPaise: lakh(2.08),
          },
        ],
      },
    },
  });

  await db.activity.createMany({
    data: [
      { kind: "WHATSAPP", body: "Sent Bali quote with pool villa option.", enquiryId: (await db.enquiry.findFirst({ where: { code: "ENQ-2026-0001" } }))!.id, userId: agent.id },
      { kind: "PAYMENT", body: "Advance ₹1,00,000 received by UPI.", bookingId: booking.id, userId: owner.id },
    ],
  });

  await db.reminder.createMany({
    data: [
      { kind: "BALANCE_DUE", dueOn: day(3), body: "Balance ₹1,08,000 due for TRP-2026-0003.", bookingId: booking.id },
      { kind: "DEPARTURE", dueOn: day(18), body: "Departure in 2 days: share vouchers and driver details.", bookingId: booking.id },
      { kind: "VENDOR_PAYMENT", dueOn: day(10), body: "Hotel Lotus balance due.", bookingId: booking.id },
    ],
  });

  console.log("Seeded: 1 operator, 3 packages, 3 enquiries, 1 booking with payments, costs and an invoice.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
