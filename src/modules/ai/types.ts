export type AiMode =
  | "CAREER"
  | "EXAM"
  | "JOB"
  | "BUSINESS"
  | "EDUCATION"
  | "RESUME"
  | "INTERVIEW"
  | "GENERAL";

export const AI_MODES: { value: AiMode; label: string; blurb: string }[] = [
  { value: "CAREER", label: "Career planning", blurb: "Which direction suits me, and what it takes" },
  { value: "EXAM", label: "Government exams", blurb: "Eligibility, syllabus and preparation time" },
  { value: "JOB", label: "Job search", blurb: "Finding roles and closing skill gaps" },
  { value: "BUSINESS", label: "Business planning", blurb: "Starting something with what you have" },
  { value: "EDUCATION", label: "Education", blurb: "Streams, degrees and pathways" },
  { value: "RESUME", label: "Résumé", blurb: "Rewrites, cover letters, applications" },
  { value: "INTERVIEW", label: "Interview prep", blurb: "Practice questions and structure" },
  { value: "GENERAL", label: "Anything else", blurb: "Not sure where to start" },
];

/** Cheap keyword router — good enough to pick a retrieval scope and a prompt. */
export function routeIntent(message: string): AiMode {
  const text = message.toLowerCase();
  const score: Record<AiMode, number> = {
    CAREER: 0, EXAM: 0, JOB: 0, BUSINESS: 0, EDUCATION: 0, RESUME: 0, INTERVIEW: 0, GENERAL: 0,
  };

  const rules: [AiMode, RegExp[]][] = [
    ["EXAM", [/\b(upsc|ssc|ibps|rrb|nda|cds|neet|jee|cat|gate|psc|exam|syllabus|prelims|mains|vacanc|notification|cut ?off)\b/]],
    ["JOB", [/\b(job|hiring|vacancy|apply|recruiter|opening|placement|salary negotiation|offer letter)\b/]],
    ["BUSINESS", [/\b(business|startup|shop|franchise|entrepreneur|invest|profit|₹\s?\d|lakh.*(start|business)|gst|udyam)\b/]],
    ["RESUME", [/\b(resume|cv|cover letter|linkedin|portfolio|application form)\b/]],
    ["INTERVIEW", [/\b(interview|hr round|technical round|mock interview|questions they ask)\b/]],
    ["EDUCATION", [/\b(class 10|class 12|10th|12th|stream|science|commerce|arts|humanities|iti|diploma|college|admission|degree|b\.?tech|b\.?com|b\.?a\b)\b/]],
    ["CAREER", [/\b(career|profession|what should i do|switch|change field|scope|future|which field|suits me)\b/]],
  ];

  for (const [mode, patterns] of rules) {
    for (const pattern of patterns) {
      if (pattern.test(text)) score[mode] += 1;
    }
  }

  const best = (Object.entries(score) as [AiMode, number][])
    .sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : "GENERAL";
}

/** Retrieval scopes per mode, so an exam question doesn't rank business records. */
export function retrievalScope(mode: AiMode): string[] | undefined {
  switch (mode) {
    case "EXAM":
      return ["exam"];
    case "BUSINESS":
      return ["business"];
    case "CAREER":
    case "EDUCATION":
      return ["career", "exam"];
    case "JOB":
    case "RESUME":
    case "INTERVIEW":
      return ["career"];
    default:
      return undefined;
  }
}
