/**
 * Résumé review.
 *
 * The distinction from `modules/documents/extract.ts` matters: that file reads
 * a résumé (what does it *say*), this one judges it (is it any *good*, for
 * this particular target). They are separate because extraction feeds the
 * user's profile and must stay conservative, while review is allowed an
 * opinion.
 *
 * Two rules shape the design:
 *
 * **The score is computed, not asserted.** Every section score comes from a
 * rule with a stated threshold — quantified bullet count, contact fields
 * present, word count band, overlap with the target role's skill list. A model
 * writes the prose around those numbers and suggests rewrites; it never sets
 * the number. That means the score means the same thing on every run, with or
 * without an API key, and a user comparing two reviews of two drafts is
 * comparing like with like.
 *
 * **The target role's skills come from the database.** "Missing keywords" is
 * only useful if the keywords are real. They are read from the occupation's
 * own skill taxonomy — the same rows the career guide renders — rather than
 * invented per request.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  careerProfiles,
  occupationSkills,
  occupations,
  resumeReviews,
  skills as skillsTable,
  type ResumeReviewShape,
} from "@/db/schema";
import { parseResumeDeterministic } from "@/modules/documents/extract";

export type ReviewTarget = {
  kind: "career" | "general";
  slug: string | null;
  label: string;
  /** Skills the role actually asks for, most important first. */
  skills: string[];
};

/** Resolves the target role from a career slug, or a neutral general target. */
export async function resolveTarget(slug: string | null | undefined): Promise<ReviewTarget> {
  if (!slug) {
    return { kind: "general", slug: null, label: "No specific role", skills: [] };
  }

  const [row] = await db
    .select({
      name: occupations.name,
      occupationId: occupations.id,
      slug: careerProfiles.slug,
    })
    .from(careerProfiles)
    .innerJoin(occupations, eq(careerProfiles.occupationId, occupations.id))
    .where(eq(careerProfiles.slug, slug))
    .limit(1);

  // A career slug is globally unique and already country-scoped by
  // construction (`software-developer-in`, `registered-nurse-ae`), so there is
  // nothing to filter here — an unknown slug simply resolves to no target.
  if (!row) {
    return { kind: "general", slug: null, label: "No specific role", skills: [] };
  }

  const skillRows = await db
    .select({ name: skillsTable.name, importance: occupationSkills.importance })
    .from(occupationSkills)
    .innerJoin(skillsTable, eq(occupationSkills.skillId, skillsTable.id))
    .where(eq(occupationSkills.occupationId, row.occupationId));

  return {
    kind: "career",
    slug: row.slug,
    label: row.name,
    skills: skillRows
      .sort((a, b) => b.importance - a.importance)
      .map((entry) => entry.name),
  };
}

// ---------------------------------------------------------------------------
// Deterministic scoring
// ---------------------------------------------------------------------------

const SECTION_HEADINGS = [
  /\b(work|professional)?\s*experience\b/i,
  /\beducation\b/i,
  /\b(skills|technical skills|core competenc)/i,
  /\b(projects?|portfolio)\b/i,
  /\b(summary|objective|profile)\b/i,
  /\b(certificat|licen[cs]e)/i,
  /\b(achievements?|awards?)\b/i,
];

/**
 * A bullet counts as quantified if it carries a number that isn't a year.
 *
 * Deliberately this blunt. An earlier version required the number to be
 * followed by a recognised unit, which meant "onboarded 4 junior engineers"
 * scored as an unquantified duty because "engineers" wasn't on the list — and
 * extending the list is endless whack-a-mole. Any figure at all is a good
 * enough proxy: bullets that merely restate duties do not contain numbers.
 */
function isQuantified(line: string): boolean {
  if (!/\d/.test(line)) return false;
  return /\d/.test(line.replace(/\b(19|20)\d{2}\b/g, ""));
}

const WEAK_OPENERS =
  /^\s*[-•*]?\s*(responsible for|worked on|helped with|involved in|assisted in|duties included|tasked with)\b/i;

const PRONOUN_HEAVY = /\b(i|my|me)\b/gi;

export type DeterministicReview = {
  sections: ResumeReviewShape["sections"];
  overall: number;
  matched: string[];
  missing: string[];
  facts: {
    wordCount: number;
    bulletCount: number;
    quantifiedBullets: number;
    weakOpeners: string[];
    headingsFound: number;
    hasEmail: boolean;
    hasPhone: boolean;
    skillsFound: string[];
    pronounCount: number;
  };
};

/**
 * The rulebook. Every threshold here is a deliberate, arguable choice, and
 * writing them down is the point — a score whose rules are hidden can't be
 * disagreed with, and this one should be.
 */
export function scoreResume(text: string, target: ReviewTarget): DeterministicReview {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // Marked bullets are the reliable signal. The length heuristic is only used
  // when the résumé has no bullet markers at all — otherwise it also catches
  // job-title lines and the summary paragraph, inflating the denominator and
  // pushing the impact score down for a document that is actually fine.
  const marked = lines.filter((line) => /^[-•*·▪]|^\d+[.)]\s/.test(line));
  const bullets = marked.length
    ? marked
    : lines.filter((line) => line.length > 40 && line.length < 220);
  const quantified = bullets.filter(isQuantified);
  const weakOpeners = bullets.filter((line) => WEAK_OPENERS.test(line)).slice(0, 6);
  const headingsFound = SECTION_HEADINGS.filter((pattern) => pattern.test(text)).length;

  const hasEmail = /[\w.+-]+@[\w-]+\.[\w.]{2,}/.test(text);
  const hasPhone = /(?:\+\d{1,3}[\s-]?)?\b[6-9]\d{9}\b|\+\d{1,3}[\s-]?\d[\d\s-]{7,}/.test(text);
  const hasLink = /\b(linkedin\.com|github\.com|behance\.net|https?:\/\/)/i.test(text);

  const parsed = parseResumeDeterministic(text);
  const skillsFound = parsed.value.skills;
  const lower = text.toLowerCase();

  const matched = target.skills.filter((skill) =>
    new RegExp(`(^|[^a-z])${skill.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(lower),
  );
  const missing = target.skills.filter((skill) => !matched.includes(skill));

  const pronounCount = (text.match(PRONOUN_HEAVY) ?? []).length;

  // --- contact -------------------------------------------------------------
  const contactScore = Math.round(
    ((hasEmail ? 45 : 0) + (hasPhone ? 35 : 0) + (hasLink ? 20 : 0)),
  );
  const contactVerdict = !hasEmail
    ? "No email address found. A recruiter who cannot reach you does not try twice."
    : !hasPhone
      ? "Email is there but no phone number. For most Indian and Gulf employers the first contact is a call."
      : hasLink
        ? "Email, phone and at least one link are all present."
        : "Contact details are complete. A LinkedIn or portfolio link would add a place to verify the claims.";

  // --- structure -----------------------------------------------------------
  const structureScore = Math.min(100, Math.round((headingsFound / 5) * 85 + (bullets.length >= 6 ? 15 : 0)));
  const structureVerdict =
    headingsFound >= 5
      ? `${headingsFound} standard sections detected. The document is easy to skim.`
      : headingsFound >= 3
        ? `Only ${headingsFound} standard sections are clearly labelled. Add explicit headings — screening software looks for them by name.`
        : "Very few labelled sections. Most automated screens parse by heading, so an unlabelled résumé can be discarded before a human sees it.";

  // --- impact --------------------------------------------------------------
  const quantRatio = bullets.length ? quantified.length / bullets.length : 0;
  const earned = quantRatio * 100;
  // The weak-opener penalty is capped at half the earned score. Uncapped, a
  // résumé with real quantified achievements and four "responsible for"
  // openers scored zero on impact — which is both wrong and demoralising for
  // the person whose two good bullets were the thing to build on.
  const penalty = Math.min(weakOpeners.length * 6, earned / 2);
  const impactScore = Math.max(0, Math.round(earned - penalty));
  const carry = quantified.length === 1 ? "carries" : "carry";
  const impactVerdict = !bullets.length
    ? "No bullet points found at all. Paragraph-form experience is much harder to scan."
    : quantRatio >= 0.5
      ? `${quantified.length} of ${bullets.length} bullets ${carry} a number. That is the strongest thing on this résumé.`
      : quantRatio >= 0.25
        ? `${quantified.length} of ${bullets.length} bullets are quantified. Aim for half — a number is what separates a claim from a duty.`
        : `Only ${quantified.length} of ${bullets.length} bullets ${carry} a number. Right now this reads as a job description rather than a record of what you did.`;

  // --- skills --------------------------------------------------------------
  const skillsScore = Math.min(100, skillsFound.length * 9);
  const skillsVerdict = skillsFound.length >= 10
    ? `${skillsFound.length} recognisable skills listed.`
    : skillsFound.length >= 5
      ? `${skillsFound.length} recognisable skills. A named skills section with the tools you actually use would help the keyword screen.`
      : "Few named skills. Screening tools match on exact terms, so list the tools, languages and systems by name.";

  // --- relevance -----------------------------------------------------------
  const relevanceScore = target.skills.length
    ? Math.round((matched.length / target.skills.length) * 100)
    : 0;
  const relevanceVerdict = !target.skills.length
    ? "No target role selected, so relevance is not scored. Pick a role above to see how this reads against it."
    : matched.length
      ? `${matched.length} of the ${target.skills.length} skills the ${target.label} guide lists appear in your résumé.`
      : `None of the ${target.skills.length} skills listed for ${target.label} appear here. Either the résumé is aimed elsewhere, or it is understating what you have.`;

  // --- length --------------------------------------------------------------
  const lengthScore =
    wordCount < 150 ? 25 : wordCount < 300 ? 65 : wordCount <= 900 ? 100 : wordCount <= 1300 ? 70 : 40;
  const lengthVerdict =
    wordCount < 300
      ? `About ${wordCount} words. That is thin — there is likely work you have not described.`
      : wordCount <= 900
        ? `About ${wordCount} words, roughly a page to a page and a half. That is the right range.`
        : `About ${wordCount} words. Beyond roughly two pages, the later material is rarely read; cut the oldest and least relevant first.`;

  const sections: ResumeReviewShape["sections"] = [
    { key: "contact", label: "Contact details", score: contactScore, verdict: contactVerdict },
    { key: "structure", label: "Structure", score: structureScore, verdict: structureVerdict },
    { key: "impact", label: "Impact and evidence", score: impactScore, verdict: impactVerdict },
    { key: "skills", label: "Skills named", score: skillsScore, verdict: skillsVerdict },
    { key: "relevance", label: `Fit for ${target.label}`, score: relevanceScore, verdict: relevanceVerdict },
    { key: "length", label: "Length", score: lengthScore, verdict: lengthVerdict },
  ];

  // Relevance is dropped from the overall when no target was chosen, rather
  // than scored as zero — penalising someone for not picking a role would make
  // the headline number meaningless.
  const counted = target.skills.length ? sections : sections.filter((s) => s.key !== "relevance");
  const weights: Record<string, number> = {
    contact: 1, structure: 1.5, impact: 2.5, skills: 1.5, relevance: 2, length: 1,
  };
  const weightTotal = counted.reduce((sum, s) => sum + weights[s.key], 0);
  const overall = Math.round(
    counted.reduce((sum, s) => sum + s.score * weights[s.key], 0) / weightTotal,
  );

  return {
    sections,
    overall,
    matched,
    missing,
    facts: {
      wordCount,
      bulletCount: bullets.length,
      quantifiedBullets: quantified.length,
      weakOpeners,
      headingsFound,
      hasEmail,
      hasPhone,
      skillsFound,
      pronounCount,
    },
  };
}

/** Rewrites and fixes the rules can produce without a model. */
function deterministicAdvice(
  scored: DeterministicReview,
  target: ReviewTarget,
): Pick<ResumeReviewShape, "rewrites" | "strengths" | "fixes"> {
  const rewrites = scored.facts.weakOpeners.slice(0, 4).map((line) => {
    const marker = /^\s*([-•*·▪])\s*/.exec(line)?.[1];
    const stripped = line.replace(/^\s*[-•*·▪]\s*/, "");
    // Quote the opener that is actually there. Telling someone "Responsible
    // for describes a duty" about a line beginning "Involved in" reads as
    // canned advice that did not look at their document — which it would be.
    const opener = WEAK_OPENERS.exec(stripped)?.[0].trim().replace(/^[-•*]\s*/, "");
    const remainder = stripped.replace(WEAK_OPENERS, "").trim();
    const body = remainder.charAt(0).toUpperCase() + remainder.slice(1);
    // Only ask for a number where there is not already one. Appending the
    // placeholder to "onboarded 4 junior engineers" tells the user to fix
    // something they got right.
    const needsFigure = !isQuantified(line);
    return {
      before: line,
      after: `${marker ? `${marker} ` : ""}${body}${needsFigure ? " — [add the number: how many, how much, how fast]" : ""}`,
      why: `“${opener ?? "Responsible for"}” describes a duty rather than an achievement. Lead with the verb${
        needsFigure ? ", and finish on a result with a number in it" : " and keep the figure you already have"
      }.`,
    };
  });

  const strengths: string[] = [];
  if (scored.facts.quantifiedBullets >= 3) {
    strengths.push(`${scored.facts.quantifiedBullets} bullets carry a concrete number.`);
  }
  if (scored.facts.headingsFound >= 5) strengths.push("Clear, conventionally named sections.");
  if (scored.facts.hasEmail && scored.facts.hasPhone) strengths.push("Reachable — email and phone both present.");
  if (scored.matched.length >= 3) {
    strengths.push(`Already shows ${scored.matched.length} of the skills ${target.label} calls for.`);
  }
  if (!strengths.length) strengths.push("There is a document to work with — that is further than most people get.");

  const fixes: ResumeReviewShape["fixes"] = [];
  if (!scored.facts.hasEmail) {
    fixes.push({ priority: "HIGH", issue: "No email address.", action: "Put a professional email address on the first line." });
  }
  if (!scored.facts.hasPhone) {
    fixes.push({ priority: "HIGH", issue: "No phone number.", action: "Add a number with the country code." });
  }
  if (scored.facts.quantifiedBullets < Math.ceil(scored.facts.bulletCount / 3)) {
    fixes.push({
      priority: "HIGH",
      issue: "Most bullets state duties rather than results.",
      action: "Rewrite the top five bullets to end in a number — volume, time saved, money, marks, headcount.",
    });
  }
  if (scored.facts.headingsFound < 4) {
    fixes.push({
      priority: "MEDIUM",
      issue: "Sections are not clearly labelled.",
      action: "Use plain headings: Summary, Experience, Education, Skills, Projects.",
    });
  }
  if (scored.missing.length) {
    fixes.push({
      priority: target.kind === "career" ? "HIGH" : "MEDIUM",
      issue: `${scored.missing.length} skills listed for ${target.label} are not mentioned.`,
      action: `If you have any of these, name them: ${scored.missing.slice(0, 8).join(", ")}. If you do not, that is the gap to close before applying.`,
    });
  }
  if (scored.facts.pronounCount > 8) {
    fixes.push({
      priority: "LOW",
      issue: `“I” or “my” appears ${scored.facts.pronounCount} times.`,
      action: "Drop the pronouns and lead with the verb. It reads faster and saves a line per bullet.",
    });
  }
  if (scored.facts.wordCount > 1300) {
    fixes.push({ priority: "MEDIUM", issue: "Too long to be read in full.", action: "Cut to two pages, oldest and least relevant first." });
  }

  return { rewrites, strengths, fixes: fixes.slice(0, 8) };
}

const LIMITATIONS = [
  "This is a structural review of the text. It cannot tell whether what you have written is true, and it does not see formatting, fonts or layout.",
  "The score compares your résumé against a rulebook, not against other applicants. A high score does not mean you are the strongest candidate for the role.",
  "Keyword matching uses the skills this platform lists for the role. A specific employer's posting will ask for its own set — read the posting too.",
  "A rulebook can count quantified bullets. It cannot tell you whether the story your résumé tells is the right one for the job you want. That is what a mentor is for.",
];

// ---------------------------------------------------------------------------
// Model layer
// ---------------------------------------------------------------------------


/**
 * Produce a résumé report.
 *
 * Every number and every piece of advice here is computed from the document by
 * the rulebook above — `scoreResume` counts, `deterministicAdvice` decides what
 * to say about the counts. Nothing is generated.
 *
 * This function used to have a second half: when a language-model key was
 * present it sent the text off and let a model write the prose around these
 * numbers. That half is gone. It was always the least trustworthy part of the
 * output — a model rewriting somebody's work history is one bad sentence away
 * from inventing an achievement — and it is now the mentor's job, which is the
 * whole point. The report tells you what the document does and does not do; a
 * human tells you what to write instead.
 */
export function reviewResumeText(input: {
  text: string;
  target: ReviewTarget;
}): { review: ResumeReviewShape; provider: string } {
  const scored = scoreResume(input.text, input.target);
  const advice = deterministicAdvice(scored, input.target);

  return {
    review: {
      overall: scored.overall,
      sections: scored.sections,
      rewrites: advice.rewrites,
      missingForTarget: scored.missing,
      matchedForTarget: scored.matched,
      strengths: advice.strengths,
      fixes: advice.fixes,
      limitations: LIMITATIONS,
    },
    provider: "rulebook",
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export async function saveReview(input: {
  userId: string;
  documentId?: string | null;
  target: ReviewTarget;
  review: ResumeReviewShape;
  provider: string;
}) {
  const [row] = await db
    .insert(resumeReviews)
    .values({
      userId: input.userId,
      documentId: input.documentId ?? null,
      targetKind: input.target.kind,
      targetSlug: input.target.slug,
      targetLabel: input.target.label,
      review: input.review,
      provider: input.provider,
    })
    .returning();
  return row;
}

export async function listReviews(userId: string, limit = 10) {
  return db
    .select()
    .from(resumeReviews)
    .where(eq(resumeReviews.userId, userId))
    .orderBy(resumeReviews.createdAt)
    .limit(limit);
}
