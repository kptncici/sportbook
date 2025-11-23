import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function timeToMinutes(t: string) {
  const [hh, mm] = t.split(":").map((x) => parseInt(x, 10));
  return hh * 60 + mm;
}

export async function POST(req: Request) {
  try {
    const { fieldId, date } = await req.json();

    if (!fieldId || !date) {
      return NextResponse.json(
        { error: "FieldId dan tanggal wajib diisi" },
        { status: 400 }
      );
    }

    // Parse date "YYYY-MM-DD"
    const selectedDate = new Date(date + "T00:00:00");
    if (Number.isNaN(selectedDate.getTime())) {
      return NextResponse.json(
        { error: "Tanggal tidak valid" },
        { status: 400 }
      );
    }

    // ============================
    //  FIX TIMEZONE → WIB
    // ============================
    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
    );

    const isToday = selectedDate.toDateString() === now.toDateString();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    // Generate slots (08:00 -> 23:00)
    const SLOTS: { label: string; start: string; end: string }[] = [];
    for (let h = 8; h < 23; h++) {
      const start = `${pad(h)}:00`;
      const end = `${pad(h + 1)}:00`;
      SLOTS.push({ label: `${start} - ${end}`, start, end });
    }

    // Date range for DB
    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);

    const nextDay = new Date(startOfDay);
    nextDay.setDate(nextDay.getDate() + 1);

    // Get bookings
    const bookings = await prisma.booking.findMany({
      where: {
        fieldId,
        date: { gte: startOfDay, lt: nextDay },
        status: { notIn: ["REJECTED", "CANCELED"] },
      },
      select: { timeStart: true, timeEnd: true, status: true },
    });

    const bookingsMinutes = bookings.map((b) => ({
      startMin: timeToMinutes(b.timeStart),
      endMin: timeToMinutes(b.timeEnd),
      status: b.status,
    }));

    // Build availability
    const availability = SLOTS.map((slot) => {
      let status = "Tersedia";

      const slotStartMin = timeToMinutes(slot.start);
      const slotEndMin = timeToMinutes(slot.end);

      // ============================
      // FIX: Lewat Waktu (pakai WIB)
      // ============================
      if (isToday && slotStartMin <= nowMinutes) {
        status = "Lewat Waktu";
        return { ...slot, status };
      }

      // Check overlap
      const overlap = bookingsMinutes.find(
        (b) => b.startMin < slotEndMin && b.endMin > slotStartMin
      );

      if (overlap) {
        if (overlap.status === "PENDING") status = "Pending";
        else if (overlap.status === "APPROVED") status = "Booked";
        else status = overlap.status ?? "Booked";
      }

      return { ...slot, status };
    });

    console.log(
      `[availability] field=${fieldId} date=${date} isToday=${isToday} now=${now.toTimeString().slice(0, 5)}`
    );

    return NextResponse.json(availability);
  } catch (err) {
    console.error("Availability Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
