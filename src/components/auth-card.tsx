import type { LucideIcon } from "lucide-react";

export function AuthCard({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-sm">
      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <Icon className="h-6 w-6" />
          </div>
          <h1 className="mt-3 text-2xl font-semibold text-gray-900">{title}</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
