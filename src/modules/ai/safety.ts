/**
 * Post-generation safety pass.
 *
 * The system prompt already tells the model not to guarantee outcomes. This
 * file exists because a prompt instruction is not an enforcement mechanism:
 * models drift, prompts get edited, and providers get swapped. A user making a
 * decision about ten years of their life should not be relying on the model
 * having followed instructions on that particular request.
 */

const GUARANTEE_PATTERNS: { pattern: RegExp; topic: string }[] = [
  { pattern: /\byou will (definitely|certainly|surely) (get|clear|crack|pass|earn)\b/i, topic: "outcome" },
  { pattern: /\bguarantee(d|s)? (a )?(job|placement|admission|selection|salary|profit|visa)\b/i, topic: "outcome" },
  { pattern: /\b100% (placement|selection|success|guarantee)\b/i, topic: "outcome" },
  { pattern: /\byou('| a)?re (guaranteed|assured) (to|of)\b/i, topic: "outcome" },
  { pattern: /\bwill (definitely|certainly) (be selected|be admitted|be hired|clear)\b/i, topic: "outcome" },
  { pattern: /\bcannot fail\b/i, topic: "outcome" },
  { pattern: /\bsure[- ]shot\b/i, topic: "outcome" },
  { pattern: /\byou will (finish|complete|cover) the (entire |whole )?syllabus in\b/i, topic: "timeline" },
  { pattern: /\bassured (income|profit|returns?)\b/i, topic: "money" },
  { pattern: /\brisk[- ]free (business|investment)\b/i, topic: "money" },
];

const HIGH_STAKES_PATTERNS: { pattern: RegExp; topic: HighStakesTopic }[] = [
  { pattern: /\b(eligib|age limit|cut ?off|last date|application (deadline|window)|notification)\b/i, topic: "eligibility" },
  { pattern: /\b(licen[cs]e|licensing|registration|council|bar exam|NMC|MCI|ICAI|regulat)\b/i, topic: "licensing" },
  { pattern: /\b(visa|immigration|work permit|PR |permanent residency)\b/i, topic: "visa" },
  { pattern: /\b(scholarship|loan|subsidy|scheme|stipend|fee waiver)\b/i, topic: "finance" },
  { pattern: /\b(salary|package|pay ?scale|CTC|LPA|stipend)\b/i, topic: "salary" },
  { pattern: /\b(fees?|cost|tuition|charges)\b/i, topic: "cost" },
];

type HighStakesTopic = "eligibility" | "licensing" | "visa" | "finance" | "salary" | "cost";

const ADVISORY: Record<HighStakesTopic, string> = {
  eligibility:
    "Eligibility rules, age limits and dates change every cycle. Confirm against the official notification for the year you're applying in before you rely on any of this.",
  licensing:
    "Licensing and registration requirements are set by the relevant regulator and differ by state and country. Confirm with that authority directly.",
  visa:
    "Visa and immigration rules change frequently and depend on your nationality. Confirm with the official immigration authority or a registered advisor.",
  finance:
    "Scholarship and scheme terms change and often have limited windows. Confirm eligibility and deadlines on the official portal before planning around them.",
  salary:
    "Salary figures here are ranges gathered for planning, not offers. Actual pay depends on employer, city, skills and negotiation.",
  cost:
    "Costs shown are approximate and move over time. Confirm current fees with the institution before budgeting on them.",
};

export type SafetyResult = {
  text: string;
  modified: boolean;
  advisories: string[];
  flaggedGuarantees: string[];
};

/**
 * Rewrites over-confident phrasing and appends the advisories the content
 * actually warrants. Advisories are deduplicated and capped so the tail of a
 * response doesn't become a wall of boilerplate nobody reads.
 */
export function applySafety(text: string): SafetyResult {
  let output = text;
  const flagged: string[] = [];

  for (const { pattern } of GUARANTEE_PATTERNS) {
    const match = output.match(pattern);
    if (match) flagged.push(match[0]);
  }

  // Soften the most explicit guarantee phrasings in place.
  output = output
    .replace(/\bguaranteed\b/gi, "likely (not guaranteed)")
    .replace(/\b100% (placement|selection|success)\b/gi, "a strong record of $1 (never a certainty)")
    .replace(/\byou will definitely\b/gi, "you would have a good chance to")
    .replace(/\byou are assured of\b/gi, "you would be well positioned for")
    .replace(/\bsure[- ]shot\b/gi, "strong but not certain");

  const topics = new Set<HighStakesTopic>();
  for (const { pattern, topic } of HIGH_STAKES_PATTERNS) {
    if (pattern.test(text)) topics.add(topic);
  }

  const advisories = [...topics].slice(0, 2).map((topic) => ADVISORY[topic]);

  if (flagged.length && !advisories.length) {
    advisories.push(
      "Nothing here is a promise of an outcome. Admission, hiring, exam results and business income all depend on factors outside any plan.",
    );
  }

  if (advisories.length) {
    output = `${output.trimEnd()}\n\n---\n\n${advisories.map((line) => `**Check this:** ${line}`).join("\n\n")}`;
  }

  return {
    text: output,
    modified: output !== text,
    advisories,
    flaggedGuarantees: flagged,
  };
}

/**
 * Questions we route to a human authority rather than answering.
 * Not a content filter — a scope boundary. A careers product should not be
 * anyone's source for medical, legal or crisis guidance.
 */
const OUT_OF_SCOPE = [
  {
    pattern: /\b(suicide|kill myself|end my life|self[- ]harm|want to die)\b/i,
    response:
      "I'm not the right place for this, and I don't want to hand you a careers answer to something much more serious.\n\nPlease talk to someone who can actually help right now. In India, Tele-MANAS is free and available 24/7 on **14416**, and KIRAN is on **1800-599-0019**. If you're elsewhere, your local emergency number or a crisis line in your country is the right call.\n\nIf you'd like, I'm here for the career questions whenever you want to come back to them.",
  },
  {
    pattern: /\b(diagnos|prescri|symptom|medicine dosage|treatment for my)\b/i,
    response:
      "That's a medical question and I'm a careers platform — I'd be guessing, and guessing badly. Please speak to a qualified doctor.\n\nIf you meant something about a career *in* medicine — eligibility, NEET, the training path, what the work is actually like — I can help with that.",
  },
  {
    pattern: /\b(my court case|sue|legal notice|file an fir|my landlord|my divorce)\b/i,
    response:
      "That needs a qualified lawyer, not a careers platform. I'd rather say so than give you something confident and wrong on a legal matter.\n\nIf your question is about a career in law — the path, the exams, what different specialisations pay — that I can do.",
  },
];

export function checkScope(message: string): string | null {
  for (const { pattern, response } of OUT_OF_SCOPE) {
    if (pattern.test(message)) return response;
  }
  return null;
}
