import Razorpay from "razorpay";
import crypto from "crypto";

let _razorpay: Razorpay | null = null;

/** Lazily constructed so builds/import-time analysis don't require real Razorpay keys to be set. */
export function getRazorpay(): Razorpay {
  if (!_razorpay) {
    _razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID ?? "",
      key_secret: process.env.RAZORPAY_KEY_SECRET ?? "",
    });
  }
  return _razorpay;
}

/** Deposit percentage used when a customer chooses a partial payment. */
export const PARTIAL_PAYMENT_PERCENT = 30;

export function partialAmount(totalAmount: number) {
  return Math.ceil((totalAmount * PARTIAL_PAYMENT_PERCENT) / 100);
}

export function verifyPaymentSignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}) {
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET ?? "")
    .update(`${params.orderId}|${params.paymentId}`)
    .digest("hex");
  return expected === params.signature;
}

export function verifyWebhookSignature(rawBody: string, signature: string) {
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET ?? "")
    .update(rawBody)
    .digest("hex");
  return expected === signature;
}
