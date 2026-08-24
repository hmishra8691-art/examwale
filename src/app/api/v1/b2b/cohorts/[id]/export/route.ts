import { route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { exportCohortReport } from "@/modules/b2b/service";

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, context: Context) => {
  const session = await requireSession();
  const { id } = await context.params;
  const csv = await exportCohortReport(id, session.sub);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cohort-${id}.csv"`,
    },
  });
});
