import { noContent, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { removeAvailabilityException } from "@/modules/mentors/service";

type Context = { params: Promise<{ exceptionId: string }> };

export const DELETE = route(async (_request: Request, context: Context) => {
  const session = await requireSession();
  const { exceptionId } = await context.params;
  await removeAvailabilityException({ userId: session.sub, id: exceptionId });
  return noContent();
});
