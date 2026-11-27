import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { multiCourtEnabled } from "@/lib/config";
import { CreateCourtForm } from "@/components/create-court-form";

export default async function AdminCourtsPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/admin");
  if (!multiCourtEnabled) redirect("/admin/venue");

  const courts = await prisma.court.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">Courts</h1>

      <div className="mb-8 space-y-3">
        {courts.map((court) => (
          <Link
            key={court.id}
            href={`/admin/courts/${court.id}`}
            className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-emerald-400"
          >
            <div>
              <p className="font-medium text-gray-900">{court.name}</p>
              <p className="text-sm text-gray-500">
                {court.sportType.replace("_", " ")} · {court.slotDurationMinutes} min slots
              </p>
            </div>
            <span className={`text-sm ${court.isActive ? "text-emerald-600" : "text-gray-400"}`}>
              {court.isActive ? "Active" : "Inactive"}
            </span>
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-medium text-gray-900">Add a court</h2>
        <CreateCourtForm />
      </div>
    </div>
  );
}
