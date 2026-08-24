import type { Metadata } from "next";
import { listUsersForAdmin } from "@/modules/admin/service";
import { Badge, Card, Callout } from "@/components/ui";
import { formatDate, relativeDays } from "@/modules/shared/format";
import { one } from "@/modules/shared/params";

export const metadata: Metadata = { title: "Users · Admin" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const ROLE_TONE: Record<string, "neutral" | "brand" | "warn"> = {
  SEEKER: "neutral",
  ORG_MEMBER: "brand",
  ADMIN: "warn",
  SUPER_ADMIN: "warn",
};

export default async function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const search = one(params.q);
  const users = await listUsersForAdmin(search);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
          Users
        </h1>
        <p className="mt-1 text-muted">{users.length} accounts shown.</p>
      </header>

      <Callout tone="info" title="What's deliberately not here">
        <p>
          This view shows account metadata only — no profile contents, documents or AI
          conversations. Support access to a user&rsquo;s own data should be a separate, logged,
          consent-gated flow, not a side effect of opening the user list.
        </p>
      </Callout>

      <form action="/admin/users" method="get">
        <label htmlFor="user-search" className="mb-1 block text-xs font-medium text-muted">
          Search by email
        </label>
        <div className="flex gap-2">
          <input
            id="user-search"
            name="q"
            type="search"
            defaultValue={search}
            className="flex-1 rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white">
            Search
          </button>
        </div>
      </form>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted">
              <th className="p-3 font-medium">Email</th>
              <th className="p-3 font-medium">Name</th>
              <th className="p-3 font-medium">Role</th>
              <th className="p-3 font-medium">Plan</th>
              <th className="p-3 font-medium">Joined</th>
              <th className="p-3 font-medium">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b last:border-0">
                <td className="p-3 font-medium">{user.email}</td>
                <td className="p-3">{user.name ?? "—"}</td>
                <td className="p-3">
                  <Badge tone={ROLE_TONE[user.role] ?? "neutral"}>{user.role.toLowerCase()}</Badge>
                </td>
                <td className="p-3">{user.plan.toLowerCase()}</td>
                <td className="p-3">{formatDate(user.createdAt)}</td>
                <td className="p-3 text-muted">
                  {user.lastLoginAt ? relativeDays(user.lastLoginAt) : "never"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
