import type { Metadata } from "next";
import { requirePage } from "@/modules/auth/session";
import { listDocuments } from "@/modules/documents/service";
import { getProvider } from "@/modules/ai/provider";
import { DocumentsWorkspace } from "@/components/documents-workspace";
import { Callout } from "@/components/ui";

export const metadata: Metadata = { title: "Documents" };

export default async function DocumentsPage() {
  const session = await requirePage("/dashboard/documents");
  const documents = await listDocuments(session.sub);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight sm:text-3xl">
          Documents
        </h1>
        <p className="mt-1 text-muted">
          Upload a résumé, marksheet, certificate or exam notification. We read it, pull out the
          structured information, and show you what we found before anything touches your profile.
        </p>
      </header>

      <Callout tone="info" title="Nothing is added without your say-so">
        <p>
          Extraction can misread tables, dates and unusual layouts. Everything we pull out is shown
          to you as a proposal with a confidence score. Your profile changes only when you confirm
          the specific items you accept.
        </p>
      </Callout>

      <DocumentsWorkspace
        initialDocuments={documents.map((document) => ({
          ...document,
          uploadedAt: document.uploadedAt.toISOString(),
        }))}
        modelBacked={getProvider().isModelBacked}
      />
    </div>
  );
}
