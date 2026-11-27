import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function AuditLogPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/admin");

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { actor: { select: { name: true, email: true } } },
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">Audit log</h1>
      {logs.length === 0 ? (
        <p className="text-sm text-gray-600">No admin actions recorded yet.</p>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900">{log.action}</span>
                <span className="text-xs text-gray-400">{log.createdAt.toLocaleString()}</span>
              </div>
              <p className="text-gray-500">
                {log.actor.name} ({log.actor.email}) · {log.targetType}
                {log.targetId ? ` · ${log.targetId}` : ""}
              </p>
              {log.metadata !== null && (
                <pre className="mt-1 overflow-x-auto rounded bg-gray-50 p-2 text-xs text-gray-600">
                  {JSON.stringify(log.metadata)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
