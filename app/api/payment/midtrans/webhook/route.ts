import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { sendMail } from "@/lib/mailer";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { order_id, transaction_status, payment_type, gross_amount } = body;

    if (!order_id) {
      return NextResponse.json({ error: "Missing order_id" }, { status: 400 });
    }

    console.log("📩 Midtrans Webhook:", body);

    /* ============================================================
        1️⃣  UPDATE / SAVE TRANSACTION
    ============================================================ */
    const tx = await prisma.transaction.upsert({
      where: { orderId: order_id },
      update: {
        status: transaction_status,
        paymentType: payment_type,
        grossAmount: parseInt(gross_amount || "0"),
        raw: body,
      },
      create: {
        orderId: order_id,
        status: transaction_status,
        paymentType: payment_type,
        grossAmount: parseInt(gross_amount || "0"),
        raw: body,
      },
    });

    /* ============================================================
        2️⃣  CARI BOOKING BERDASARKAN transactionId
    ============================================================ */
    let booking = await prisma.booking.findFirst({
      where: { transactionId: tx.id },
      include: { user: true, field: true },
    });

    // JIKA booking NULL → fallback by orderId
    if (!booking) {
      booking = await prisma.booking.findFirst({
        where: {
          id: order_id.replace("SPORTBOOK-", "").split("-")[0], // ekstrak id booking
        },
        include: { user: true, field: true },
      });
    }

    if (!booking) {
      console.log("⚠️ Booking tidak ditemukan untuk orderId:", order_id);
      return NextResponse.json({ success: true });
    }

    /* ============================================================
        3️⃣ UPDATE STATUS BOOKING
    ============================================================ */
    if (["settlement", "capture"].includes(transaction_status)) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: { status: "PAID" },
      });

      console.log("💰 Pembayaran sukses → update booking menjadi PAID");
    }

    if (["cancel", "expire", "deny"].includes(transaction_status)) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: { status: "CANCELED" },
      });

      return NextResponse.json({ success: true });
    }

    // Kalau bukan pembayaran sukses, tidak perlu kirim e-ticket
    if (!["settlement", "capture"].includes(transaction_status)) {
      return NextResponse.json({ success: true });
    }

    /* ============================================================
        4️⃣ GENERATE E-TICKET PDF
    ============================================================ */

    const qrBase64 = await QRCode.toDataURL(booking.id);
    const qrBuffer = Buffer.from(qrBase64.split(",")[1], "base64");

    const doc = new PDFDocument({ size: "A5", margin: 40 });
    const buffers: Buffer[] = [];

    doc.on("data", (chunk) => buffers.push(chunk));

    // load font aman
    try {
      const fontPaths = [
        "C:\\Windows\\Fonts\\arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        path.join(process.cwd(), "public", "fonts", "Roboto-Regular.ttf"),
      ];
      const foundFont = fontPaths.find((f) => fs.existsSync(f));

      if (foundFont) {
        doc.registerFont("SafeFont", foundFont);
        doc.font("SafeFont");
      } else {
        doc.font("Times-Roman");
      }
    } catch {
      doc.font("Times-Roman");
    }

    // header
    doc
      .rect(0, 0, doc.page.width, 60)
      .fill("#1e3a8a")
      .fillColor("white")
      .fontSize(20)
      .text("SPORTBOOK E-TICKET", 40, 20);

    // QR
    doc.image(qrBuffer, 150, 100, { width: 100 });

    // info booking
    const info: [string, string][] = [
      ["Nama", booking.user?.name ?? booking.user?.email ?? "-"],
      ["Lapangan", booking.field?.name ?? "-"],
      ["Tanggal", booking.date.toISOString().slice(0, 10)],
      ["Waktu", `${booking.timeStart} - ${booking.timeEnd}`],
      ["Harga", `Rp ${booking.field?.price.toLocaleString("id-ID")}`],
      ["Status", "✔ Sudah Dibayar"],
    ];

    let y = 220;
    for (const [label, value] of info) {
      doc.fillColor("#111").fontSize(12).text(`${label}:`, 40, y);
      doc.fillColor("#2563eb").text(value, 140, y);
      y += 22;
    }

    doc.end();

    const pdfBuffer = await new Promise<Buffer>((resolve) =>
      doc.on("end", () => resolve(Buffer.concat(buffers)))
    );

    /* ============================================================
        5️⃣ KIRIM E-TICKET VIA EMAIL
    ============================================================ */
    await sendMail({
      to: booking.user.email,
      subject: "E-Ticket SportBook — Pembayaran Berhasil",
      html: `
        <h3>Halo ${booking.user.name ?? booking.user.email},</h3>
        <p>Pembayaran Anda telah <b style="color:green">BERHASIL</b>.</p>
        <p>Terlampir e-ticket Anda. Tunjukkan QR saat check-in.</p>
      `,
      attachments: [
        {
          filename: `E-Ticket-${booking.id}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("❌ Midtrans Webhook error:", error);
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}
