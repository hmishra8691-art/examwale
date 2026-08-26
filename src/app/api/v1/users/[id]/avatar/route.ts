/**
 * Serve one person's profile picture.
 *
 * Who may see it: anybody, if the person is a publicly-listed provider — their
 * profile is already a public page. Otherwise a signed-in account.
 *
 * That second rule is looser than a per-relationship check, and the reason it is
 * acceptable is that user ids are random 21-character identifiers, not
 * sequential. There is no enumeration to do: fetching somebody's picture
 * requires already knowing their id, which means having seen them somewhere you
 * were entitled to. Tightening this to "only people you share a session,
 * application or conversation with" is a real improvement and belongs with
 * messaging, where the relationships it needs will exist.
 *
 * Cached for a year and marked immutable, which is safe because the URL carries
 * the picture's content hash — a new picture is a new URL, so a stale cache is
 * impossible rather than merely unlikely.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { providerCapabilities, providerProfiles, users } from "@/db/schema";
import { getSession } from "@/modules/auth/session";
import { isAvatarSize, AVATAR_CONTENT_TYPE } from "@/modules/documents/images";
import { readAvatar } from "@/modules/users/avatar";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const sizeParam = url.searchParams.get("size") ?? "sm";
  const size = isAvatarSize(sizeParam) ? sizeParam : "sm";

  const [row] = await db
    .select({
      hash: users.avatarHash,
      visibility: providerProfiles.visibility,
      capabilityStatus: providerCapabilities.status,
    })
    .from(users)
    .leftJoin(providerProfiles, eq(providerProfiles.userId, users.id))
    .leftJoin(
      providerCapabilities,
      eq(providerCapabilities.providerProfileId, providerProfiles.id),
    )
    .where(eq(users.id, id))
    .limit(1);

  if (!row?.hash) {
    // 404 for "no picture" as well as "no such person": whether an account
    // exists is not something an unauthenticated caller needs to learn.
    return new Response(null, { status: 404 });
  }

  const publiclyListed = row.visibility === "PUBLIC" && row.capabilityStatus === "ACTIVE";
  if (!publiclyListed && !(await getSession())) {
    return new Response(null, { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = await readAvatar(id, row.hash, size);
  } catch {
    return new Response(null, { status: 404 });
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": AVATAR_CONTENT_TYPE,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      // Not a page, and never to be interpreted as one.
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
