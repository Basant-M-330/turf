import { Resend } from "resend";
import { brandName } from "@/lib/config";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/**
 * Sends a transactional email via Resend. If RESEND_API_KEY isn't configured (local dev,
 * or a client deployment that hasn't set one up yet), the email is logged instead of sent
 * so flows like password reset still work end-to-end during development.
 */
export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  if (!resend) {
    console.log(`[email:not-configured] to=${to} subject="${subject}"\n${html}`);
    return;
  }

  await resend.emails.send({
    from: `${brandName} <${process.env.EMAIL_FROM ?? "onboarding@resend.dev"}>`,
    to,
    subject,
    html,
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  await sendEmail({
    to,
    subject: `Reset your ${brandName} password`,
    html: `
      <p>We received a request to reset your ${brandName} password.</p>
      <p><a href="${resetUrl}">Click here to choose a new password</a>. This link expires in 1 hour.</p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `,
  });
}

export async function sendBookingConfirmationEmail(
  to: string,
  booking: { courtName: string; date: string; startTime: string; endTime: string; totalAmount: number; paidAmount: number }
) {
  await sendEmail({
    to,
    subject: `Booking confirmed — ${booking.courtName}`,
    html: `
      <p>Your booking is confirmed:</p>
      <ul>
        <li>${booking.courtName}</li>
        <li>${booking.date}, ${booking.startTime}–${booking.endTime}</li>
        <li>Paid ₹${booking.paidAmount} of ₹${booking.totalAmount}</li>
      </ul>
    `,
  });
}
