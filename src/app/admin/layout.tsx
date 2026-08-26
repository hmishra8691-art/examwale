import { requireAdminPage } from "@/modules/auth/session";
import { AdminNav } from "@/components/admin-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage("/admin");

  return (
    <div className="page py-6">
      <div className="mb-6 rounded-lg border border-saffron-300 bg-saffron-50 px-4 py-3 text-sm dark:border-saffron-800 dark:bg-saffron-900/20">
        <strong>Admin area.</strong> Every change here is written to the audit log with your account
        against it.
      </div>
      <div className="shell">
        <AdminNav />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
