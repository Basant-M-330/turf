import { CalendarCheck, Timer, Wallet } from "lucide-react";

const STEPS = [
  {
    icon: CalendarCheck,
    title: "Pick a slot",
    text: "Choose a date and an open time on the board below.",
  },
  {
    icon: Timer,
    title: "Held for 5 minutes",
    text: "Your slot is locked just for you while you check out — no one else can grab it.",
  },
  {
    icon: Wallet,
    title: "Pay & play",
    text: "Pay in full, pay a deposit online, or pay at the venue — your call.",
  },
];

export function HowItWorks() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {STEPS.map(({ icon: Icon, title, text }) => (
        <div key={title} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
            <Icon className="h-5 w-5" />
          </div>
          <h3 className="mt-3 font-semibold text-gray-900">{title}</h3>
          <p className="mt-1 text-sm text-gray-600">{text}</p>
        </div>
      ))}
    </div>
  );
}
