import Link from "next/link";
import { requirePage } from "@/modules/auth/session";
import { DashboardNav } from "@/components/dashboard-nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requirePage("/dashboard");

  return (
    <div className="page py-6">
      <div className="shell">
        <DashboardNav />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
