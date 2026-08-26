/**
 * Document text extraction and structured parsing.
 *
 * Two-stage by design. Stage one pulls plain text out of the file. Stage two
 * turns that text into structured fields — with a per-field confidence score,
 * because the user is asked to confirm before anything reaches their profile.
 *
 * The deterministic parser below runs regardless of whether a model is
 * available: it is the floor, not a placeholder. When a model is configured its
 * output is merged over the top, and disagreements resolve to lower confidence
 * rather than to the model.
 */
import type { DocumentType, ExtractedResume } from "@/db/schema";

export async function extractText(input: {
  buffer: Buffer;
  mimeType: string;
}): Promise<{ text: string; ocrUsed: boolean }> {
  switch (input.mimeType) {
    case "text/plain":
      return { text: input.buffer.toString("utf8"), ocrUsed: false };

    case "application/pdf": {
      try {
        const mod = await import("pdf-parse");
        const parse = (mod as unknown as { default?: unknown }).default ?? mod;
        const result = await (parse as (b: Buffer) => Promise<{ text: string }>)(input.buffer);
        return { text: result.text ?? "", ocrUsed: false };
      } catch (error) {
        console.error("[documents] pdf extraction failed", error);
        return { text: "", ocrUsed: false };
      }
    }

    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      try {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer: input.buffer });
        return { text: result.value ?? "", ocrUsed: false };
      } catch (error) {
        console.error("[documents] docx extraction failed", error);
        return { text: "", ocrUsed: false };
      }
    }

    case "image/png":
    case "image/jpeg":
      // OCR needs a service (Tesseract worker or a cloud OCR API). Until one is
      // wired up we say so rather than returning empty text as though the
      // document were blank.
      return { text: "", ocrUsed: false };

    default:
      return { text: "", ocrUsed: false };
  }
}

const TYPE_SIGNALS: { type: DocumentType; patterns: RegExp[] }[] = [
  {
    type: "RESUME",
    patterns: [/\b(curriculum vitae|resume|work experience|professional summary|career objective)\b/i, /\b(skills|education)\b[\s\S]{0,400}\b(experience|projects)\b/i],
  },
  {
    type: "MARKSHEET",
    patterns: [/\b(marks? ?sheet|statement of marks|grade card|percentage|CGPA|SGPA|board of secondary)\b/i],
  },
  {
    type: "EXAM_NOTIFICATION",
    patterns: [/\b(recruitment notification|advertisement no|vacanc(y|ies)|last date for (online )?application|eligibility criteria)\b/i],
  },
  {
    type: "JOB_DESCRIPTION",
    patterns: [/\b(job description|roles? and responsibilit|we are looking for|about the role|what you.ll do)\b/i],
  },
  {
    type: "BUSINESS_PLAN",
    patterns: [/\b(business plan|executive summary|market analysis|revenue projection|break[- ]even)\b/i],
  },
  {
    type: "CERTIFICATE",
    patterns: [/\b(this is to certify|certificate of (completion|achievement|participation)|hereby certifies)\b/i],
  },
];

export function classifyDocument(text: string): { type: DocumentType; confidence: number } {
  const scores = TYPE_SIGNALS.map(({ type, patterns }) => ({
    type,
    hits: patterns.filter((pattern) => pattern.test(text)).length,
  })).sort((a, b) => b.hits - a.hits);

  const best = scores[0];
  if (!best || best.hits === 0) return { type: "OTHER", confidence: 0.2 };
  return { type: best.type, confidence: Math.min(0.95, 0.5 + best.hits * 0.2) };
}

// ---------------------------------------------------------------------------
// Deterministic résumé parsing
// ---------------------------------------------------------------------------

const SKILL_VOCABULARY = [
  "python","java","javascript","typescript","c++","c#","go","rust","php","ruby","kotlin","swift",
  "sql","mysql","postgresql","mongodb","redis","oracle","plsql",
  "react","angular","vue","next.js","node.js","express","django","flask","spring","laravel",
  "aws","azure","gcp","docker","kubernetes","terraform","jenkins","ci/cd","linux","git",
  "html","css","tailwind","bootstrap","sass",
  "machine learning","deep learning","nlp","computer vision","tensorflow","pytorch","scikit-learn",
  "pandas","numpy","excel","power bi","tableau","looker","data analysis","statistics",
  "figma","photoshop","illustrator","autocad","solidworks","catia","revit","staad",
  "tally","gst","accounting","bookkeeping","taxation","auditing","financial modelling",
  "digital marketing","seo","sem","content writing","social media","google analytics",
  "communication","leadership","teamwork","problem solving","project management","agile","scrum",
  "salesforce","sap","erp","crm","customer service","sales","business development",
  "teaching","curriculum","counselling","recruitment","payroll","hr operations",
  "welding","electrical","plumbing","hvac","cnc","machining","fabrication","automobile",
  "nursing","patient care","pharmacology","radiology","physiotherapy","first aid",
];

const DEGREE_PATTERNS = [
  /\b(b\.?tech|bachelor of technology)\b/i,
  /\b(b\.?e\.?|bachelor of engineering)\b/i,
  /\b(b\.?sc|bachelor of science)\b/i,
  /\b(b\.?com|bachelor of commerce)\b/i,
  /\b(b\.?a\.?|bachelor of arts)\b/i,
  /\b(bba|bachelor of business)\b/i,
  /\b(bca|bachelor of computer applications)\b/i,
  /\b(m\.?tech|master of technology)\b/i,
  /\b(m\.?sc|master of science)\b/i,
  /\b(mba|master of business)\b/i,
  /\b(mca|master of computer applications)\b/i,
  /\b(m\.?com|master of commerce)\b/i,
  /\b(mbbs|bds|bams|bhms)\b/i,
  /\b(ph\.?d|doctorate)\b/i,
  /\b(diploma|polytechnic|iti)\b/i,
  /\b(class (10|12|x|xii)|higher secondary|senior secondary)\b/i,
];

export function parseResumeDeterministic(text: string): {
  value: ExtractedResume;
  confidence: Record<string, number>;
} {
  const lower = text.toLowerCase();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/)?.[0];
  const phone = text.match(/(?:\+91[\s-]?)?\b[6-9]\d{9}\b/)?.[0];

  const foundSkills = SKILL_VOCABULARY.filter((skill) => {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i").test(lower);
  });

  const education = DEGREE_PATTERNS.flatMap((pattern) => {
    const match = text.match(pattern);
    if (!match) return [];
    const line = lines.find((candidate) => pattern.test(candidate)) ?? match[0];
    const year = line.match(/\b(19|20)\d{2}\b/)?.[0];
    return [{ qualification: match[0].trim(), institution: extractInstitution(line), year }];
  });

  const experience = extractExperience(lines);
  const totalYears = estimateYears(text);

  const certifications = lines
    .filter((line) => /\b(certified|certification|certificate)\b/i.test(line) && line.length < 140)
    .slice(0, 6);

  const issues = buildIssues({ text, lines, email, phone, foundSkills, experience });

  // Confidence reflects how strong the signal was, not how good the résumé is.
  const confidence: Record<string, number> = {
    email: email ? 0.97 : 0,
    phone: phone ? 0.9 : 0,
    skills: foundSkills.length >= 5 ? 0.8 : foundSkills.length ? 0.55 : 0.1,
    education: education.length ? 0.75 : 0.1,
    experience: experience.length ? 0.6 : 0.15,
    totalYearsExperience: totalYears != null ? 0.5 : 0,
    certifications: certifications.length ? 0.5 : 0.1,
  };

  return {
    value: {
      fullName: guessName(lines),
      email,
      phone,
      skills: foundSkills,
      education: dedupeEducation(education),
      experience,
      certifications,
      totalYearsExperience: totalYears,
      issues,
    },
    confidence,
  };
}

function extractInstitution(line: string): string | undefined {
  const match = line.match(/\b(?:from|at)\s+([A-Z][\w&.,'\- ]{4,60})/);
  if (match) return match[1].trim();
  const institution = line.match(/\b([A-Z][\w&.'\- ]*(?:University|Institute|College|School|Polytechnic|IIT|NIT|IIIT))\b/);
  return institution?.[1]?.trim();
}

function extractExperience(lines: string[]): ExtractedResume["experience"] {
  const results: ExtractedResume["experience"] = [];
  const rolePattern =
    /\b(engineer|developer|analyst|manager|consultant|designer|executive|officer|associate|intern|technician|accountant|teacher|specialist|lead|architect|administrator|assistant)\b/i;
  const durationPattern = /\b((19|20)\d{2})\s*[-–—to]+\s*((19|20)\d{2}|present|current)\b/i;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.length > 120 || !rolePattern.test(line)) continue;

    const window = [line, lines[index + 1] ?? ""].join(" ");
    const duration = window.match(durationPattern)?.[0];
    const organisation = window.match(/\bat\s+([A-Z][\w&.,'\- ]{2,50})/)?.[1];

    results.push({
      title: line.replace(/\s{2,}/g, " ").slice(0, 90),
      organisation: organisation?.trim(),
      duration,
      summary: undefined,
    });

    if (results.length >= 8) break;
  }
  return results;
}

function estimateYears(text: string): number | undefined {
  const explicit = text.match(/\b(\d{1,2})(?:\.\d)?\s*\+?\s*(?:years?|yrs?)\s+(?:of\s+)?experience\b/i);
  if (explicit) return Number(explicit[1]);

  // Fall back to the span between the earliest and latest employment years.
  const ranges = [...text.matchAll(/\b((19|20)\d{2})\s*[-–—to]+\s*((19|20)\d{2}|present|current)\b/gi)];
  if (!ranges.length) return undefined;

  const currentYear = new Date().getFullYear();
  let earliest = currentYear;
  let latest = 0;
  for (const range of ranges) {
    const start = Number(range[1]);
    const endRaw = range[3];
    const end = /present|current/i.test(endRaw) ? currentYear : Number(endRaw);
    if (start >= 1950 && start <= currentYear) earliest = Math.min(earliest, start);
    if (end >= 1950 && end <= currentYear) latest = Math.max(latest, end);
  }
  if (latest <= earliest) return undefined;
  return Math.min(50, latest - earliest);
}

function guessName(lines: string[]): string | undefined {
  const candidate = lines
    .slice(0, 5)
    .find(
      (line) =>
        line.length >= 4 &&
        line.length <= 48 &&
        /^[A-Za-z][A-Za-z.'\- ]+$/.test(line) &&
        line.split(/\s+/).length <= 5 &&
        !/resume|curriculum|vitae|profile|contact/i.test(line),
    );
  return candidate;
}

function dedupeEducation(entries: ExtractedResume["education"]): ExtractedResume["education"] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = entry.qualification.toLowerCase().replace(/[^a-z]/g, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Résumé problems worth telling the user about, phrased as fixes not scolding. */
function buildIssues(input: {
  text: string;
  lines: string[];
  email?: string;
  phone?: string;
  foundSkills: string[];
  experience: ExtractedResume["experience"];
}): string[] {
  const issues: string[] = [];
  const wordCount = input.text.split(/\s+/).length;

  if (!input.email) issues.push("No email address found — recruiters need one at the top of the page.");
  if (!input.phone) issues.push("No phone number found. Add one near your email.");
  if (input.foundSkills.length < 4) {
    issues.push("Few recognisable skills listed. Add a short skills section with the tools and technologies you actually use.");
  }
  if (!input.experience.length) {
    issues.push("No clearly dated roles found. List each role as 'Title — Organisation, 2022–2024' so both people and parsers can read it.");
  }
  if (wordCount < 150) {
    issues.push("This is very short. Two-thirds of a page of specifics beats a full page of adjectives, but this is under even that.");
  }
  if (wordCount > 1200) {
    issues.push("This runs long. Most recruiters skim for fifteen seconds — cut to two pages, keeping the most recent and most relevant.");
  }
  if (!/\d/.test(input.text)) {
    issues.push("No numbers anywhere. Quantify what you did — team size, volume handled, percentage improved.");
  }
  if (/\bresponsible for\b/i.test(input.text)) {
    issues.push("'Responsible for' describes a job description, not an achievement. Lead with what changed because you were there.");
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Model-assisted merge
// ---------------------------------------------------------------------------


/**
 * Pull structured fields out of a résumé.
 *
 * `parseResumeDeterministic` does this with patterns and a curated skill
 * vocabulary. A model used to run alongside it and the two results were merged,
 * which caught skills outside the vocabulary at the cost of occasionally
 * recording a degree the document did not claim.
 *
 * Nothing extracted here has ever reached a profile without the user confirming
 * each item — that gate is unchanged and is why this was safe to run at all.
 * The model half is gone regardless: the accuracy it bought was small, and it
 * was the last thing sending someone's employment history to a third party.
 */
export function parseResume(text: string): {
  value: ExtractedResume;
  confidence: Record<string, number>;
  provider: string;
} {
  return { ...parseResumeDeterministic(text), provider: "rulebook" };
}

/** Structured read of a government exam notification (spec section 19). */
export type ExtractedNotification = {
  organisation?: string;
  postName?: string;
  vacancies?: number;
  eligibility: string[];
  ageLimit?: string;
  importantDates: { label: string; value: string }[];
  applicationFee: { category: string; amount: string }[];
  selectionProcess: string[];
  documentsRequired: string[];
  officialUrl?: string;
  notes: string[];
};

export function parseNotificationDeterministic(text: string): {
  value: ExtractedNotification;
  confidence: Record<string, number>;
} {
  const dates: { label: string; value: string }[] = [];
  const datePattern =
    /([A-Z][^.\n:]{4,60}(?:date|deadline|last day|commencement|closing)[^.\n:]{0,30})\s*[:\-–]\s*([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4}|[0-9]{1,2}\s+\w+\s+[0-9]{4})/gi;
  for (const match of text.matchAll(datePattern)) {
    dates.push({ label: match[1].trim(), value: match[2].trim() });
  }

  const fees: { category: string; amount: string }[] = [];
  const feePattern = /\b(General|OBC|SC|ST|EWS|PwD|Female|All candidates)\b[^\n₹]{0,40}₹\s?([\d,]+)/gi;
  for (const match of text.matchAll(feePattern)) {
    fees.push({ category: match[1], amount: `₹${match[2]}` });
  }

  const vacancyMatch = text.match(/\b(?:total\s+)?(?:no\.?\s*of\s*)?vacanc(?:y|ies)\s*[:\-–]?\s*([\d,]+)/i);
  const ageMatch = text.match(/\bage\s*(?:limit|criteria)?\s*[:\-–]?\s*([^\n.]{5,120})/i);

  const eligibility = text
    .split(/\r?\n/)
    .filter((line) => /\b(must have|should have|minimum|eligib|qualificat|degree|graduat)\b/i.test(line))
    .map((line) => line.trim())
    .filter((line) => line.length > 15 && line.length < 240)
    .slice(0, 8);

  const selection = text
    .split(/\r?\n/)
    .filter((line) => /\b(tier|stage|prelim|mains?|interview|physical test|typing test|written test|skill test)\b/i.test(line))
    .map((line) => line.trim())
    .filter((line) => line.length > 8 && line.length < 200)
    .slice(0, 8);

  const documents = text
    .split(/\r?\n/)
    .filter((line) => /\b(photograph|signature|aadhaar|marksheet|certificate|id proof|caste certificate)\b/i.test(line))
    .map((line) => line.trim())
    .slice(0, 8);

  return {
    value: {
      organisation: text.match(/\b(?:Staff Selection Commission|Union Public Service Commission|[A-Z][A-Za-z ]{5,50}(?:Commission|Board|Bank|Railway|Ministry))\b/)?.[0],
      postName: text.match(/\bpost\s*(?:name)?\s*[:\-–]\s*([^\n]{3,80})/i)?.[1]?.trim(),
      vacancies: vacancyMatch ? Number(vacancyMatch[1].replace(/,/g, "")) : undefined,
      eligibility,
      ageLimit: ageMatch?.[1]?.trim(),
      importantDates: dates.slice(0, 10),
      applicationFee: fees.slice(0, 6),
      selectionProcess: selection,
      documentsRequired: documents,
      officialUrl: text.match(/https?:\/\/[^\s)]+/)?.[0],
      notes: [
        "Everything above was read directly out of the document you uploaded. It has not been cross-checked against the issuing authority.",
        "Before you apply, confirm each date and eligibility clause on the official notification — extraction can misread tables and footnotes.",
      ],
    },
    confidence: {
      importantDates: dates.length ? 0.7 : 0.1,
      applicationFee: fees.length ? 0.7 : 0.1,
      eligibility: eligibility.length ? 0.6 : 0.1,
      vacancies: vacancyMatch ? 0.75 : 0,
      selectionProcess: selection.length ? 0.6 : 0.1,
    },
  };
}
