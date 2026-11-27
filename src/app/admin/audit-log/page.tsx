import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function actionBadgeStyle(action: string) {
  if (/create|add/.test(action)) return "bg-emerald-50 text-emerald-700";
  if (/delete|remove|deactivate|cancel/.test(action)) return "bg-red-50 text-red-700";
  return "bg-blue-50 text-blue-700";
}

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
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-gray-300 bg-white py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <ClipboardList className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm text-gray-600">No admin actions recorded yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="rounded-xl border border-gray-200 bg-white p-4 text-sm shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${actionBadgeStyle(log.action)}`}
                >
                  {log.action}
                </span>
                <span className="shrink-0 text-xs text-gray-400">{log.createdAt.toLocaleString()}</span>
              </div>
              <p className="mt-2 text-gray-500">
                {log.actor.name} ({log.actor.email}) · {log.targetType}
                {log.targetId ? ` · ${log.targetId}` : ""}
              </p>
              {log.metadata !== null && (
                <pre className="mt-2 overflow-x-auto rounded bg-gray-50 p-2 text-xs text-gray-600">
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
