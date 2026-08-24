import { requireAdminPage } from "@/modules/auth/session";
import { AdminNav } from "@/components/admin-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage("/admin");

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-4 rounded-lg border border-saffron-300 bg-saffron-50 px-4 py-2 text-sm dark:border-saffron-800 dark:bg-saffron-900/20">
        <strong>Admin area.</strong> Every change here is written to the audit log with your account
        against it.
      </div>
      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <AdminNav />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
