import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StaffManager } from "@/components/staff-manager";

export default async function AdminStaffPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/admin");

  const staff = await prisma.user.findMany({
    where: { role: { in: ["STAFF", "ADMIN"] } },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Staff accounts</h1>
      <StaffManager initialStaff={staff} currentUserId={session.user.id} />
    </div>
  );
}
