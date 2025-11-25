import { NextResponse } from "next/server";
import midtransClient from "midtrans-client";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { bookingId } = await req.json();
    if (!bookingId) {
      return NextResponse.json({ error: "Booking ID diperlukan" }, { status: 400 });
    }

    if (!process.env.MIDTRANS_SERVER_KEY) {
      return NextResponse.json(
        { error: "MIDTRANS_SERVER_KEY tidak ditemukan" },
        { status: 500 }
      );
    }

    // Ambil booking
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { user: true, field: true },
    });

    if (!booking) {
      return NextResponse.json({ error: "Booking tidak ditemukan" }, { status: 404 });
    }

    if (booking.status !== "APPROVED") {
      return NextResponse.json(
        { error: "Booking belum disetujui admin" },
        { status: 403 }
      );
    }

    // Buat order id unik
    const orderId = `SPORTBOOK-${booking.id}-${Date.now()}`;

    // === 1) Buat record Transaction di DB ===
    const transaction = await prisma.transaction.create({
      data: {
        orderId,
        status: "PENDING",
        paymentType: null,
        grossAmount: booking.field.price,
      },
    });

    // === 2) Sambungkan transaction ke booking ===
    await prisma.booking.update({
      where: { id: booking.id },
      data: { transactionId: transaction.id },
    });

    // === 3) Buat Midtrans transaction ===
    const snap = new midtransClient.Snap({
      isProduction: false,
      serverKey: process.env.MIDTRANS_SERVER_KEY!,
    });

    const snapTx = await snap.createTransaction({
      transaction_details: {
        order_id: orderId,
        gross_amount: booking.field.price,
      },
      customer_details: {
        first_name: booking.user.name || "User",
        email: booking.user.email,
      },
      item_details: [
        {
          id: booking.field.id,
          name: booking.field.name,
          quantity: 1,
          price: booking.field.price,
        },
      ],
      enabled_payments: ["gopay", "qris", "bca_va", "bni_va", "bri_va"],
    });

    return NextResponse.json({
      ok: true,
      token: snapTx.token,
      paymentUrl: snapTx.redirect_url,
      orderId,
      transactionId: transaction.id,
    });

  } catch (err) {
    console.error("🔥 Payment Create Error:", err);
    return NextResponse.json(
      { error: "Gagal membuat pembayaran" },
      { status: 500 }
    );
  }
}
