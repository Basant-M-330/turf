import { CheckoutFlow } from "@/components/checkout-flow";
import { multiCourtEnabled } from "@/lib/config";

export default async function CheckoutPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  return (
    <div className="mx-auto max-w-md">
      <CheckoutFlow bookingId={bookingId} multiCourtEnabled={multiCourtEnabled} />
    </div>
  );
}
