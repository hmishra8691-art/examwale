/**
 * Interview practice.
 *
 * Two halves. `generateInterview` builds a question set for a target role;
 * `gradeAnswer` scores an attempt at one of those questions.
 *
 * The grading rubric is computed, for the same reason the résumé score is: a
 * number that moves when the model's mood changes is not feedback, it is
 * noise. Specificity, ownership, structure and length are all measurable in
 * the text. The model writes the comments and the rewritten answer — and the
 * rewrite is a rewrite *of the user's answer*, never a model answer dropped in
 * its place, because a candidate who memorises someone else's story is worse
 * off in the room than one with a rough version of their own.
 *
 * Questions for a role are grounded in that role's own guide — the day-to-day,
 * the regulation, the progression ladder, the disadvantages people don't
 * expect. That is what makes them different from a generic list, and it is
 * also why a role with no guide gets the generic set and is told so.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  careerProfiles,
  interviewAnswers,
  interviewSessions,
  occupations,
  type InterviewFeedback,
  type InterviewQuestion,
} from "@/db/schema";
import { ForbiddenError, NotFoundError } from "@/modules/shared/errors";

export const INTERVIEW_ROUNDS = [
  { value: "MIXED", label: "Full mock", blurb: "A mix of everything, in the order a real panel asks" },
  { value: "HR", label: "HR round", blurb: "Motivation, fit, gaps, salary" },
  { value: "TECHNICAL", label: "Technical round", blurb: "The skills the role actually uses" },
  { value: "BEHAVIOURAL", label: "Behavioural", blurb: "Past situations, conflict, failure, teamwork" },
] as const;

export type InterviewRound = (typeof INTERVIEW_ROUNDS)[number]["value"];

type RoleContext = {
  slug: string | null;
  label: string;
  summary: string | null;
  dayToDay: string | null;
  disadvantages: string[];
  progression: string[];
  regulated: boolean;
  licensingNote: string | null;
};

async function loadRole(slug: string | null | undefined): Promise<RoleContext | null> {
  if (!slug) return null;

  const [row] = await db
    .select({
      slug: careerProfiles.slug,
      label: occupations.name,
      summary: careerProfiles.summary,
      dayToDay: careerProfiles.dayToDay,
      disadvantages: careerProfiles.disadvantages,
      progression: careerProfiles.progression,
      regulated: careerProfiles.isRegulated,
      licensingNote: careerProfiles.licensingNote,
    })
    .from(careerProfiles)
    .innerJoin(occupations, eq(careerProfiles.occupationId, occupations.id))
    .where(and(eq(careerProfiles.slug, slug), eq(careerProfiles.status, "PUBLISHED")))
    .limit(1);

  if (!row) return null;

  return {
    slug: row.slug,
    label: row.label,
    summary: row.summary,
    dayToDay: row.dayToDay,
    disadvantages: Array.isArray(row.disadvantages) ? row.disadvantages : [],
    progression: Array.isArray(row.progression)
      ? row.progression.map((entry) => entry?.stage ?? "").filter(Boolean)
      : [],
    regulated: row.regulated,
    licensingNote: row.licensingNote,
  };
}

// ---------------------------------------------------------------------------
// Deterministic question bank
// ---------------------------------------------------------------------------

type Draft = Omit<InterviewQuestion, "index">;

function genericBank(label: string): Record<string, Draft[]> {
  return {
    OPENER: [
      {
        question: "Walk me through your background and how it led you here.",
        probing: "Whether you can tell a coherent two-minute story instead of reciting the résumé line by line.",
        category: "OPENER",
        difficulty: "WARM_UP",
        skeleton: [
          "Where you started, in one sentence.",
          "The two or three moves that matter, and why you made them.",
          "What you are doing now and what you want next — landing on this role.",
        ],
      },
    ],
    MOTIVATION: [
      {
        question: `Why ${label} specifically, and not the adjacent options?`,
        probing: "Whether you have compared alternatives, or drifted here. Interviewers can hear the difference.",
        category: "MOTIVATION",
        difficulty: "STANDARD",
        skeleton: [
          "Name the alternative you seriously considered.",
          "The specific thing about this work that decided it.",
          "Evidence you have already tested that interest — a project, a course, a conversation.",
        ],
      },
      {
        question: "Where do you want to be in five years, and what does this role have to do with it?",
        probing: "Whether your plan is compatible with the job, and whether you have one at all.",
        category: "MOTIVATION",
        difficulty: "STANDARD",
        skeleton: [
          "A direction, not a job title.",
          "The capability you need to build to get there.",
          "Why this role is a reasonable next step towards it.",
        ],
      },
    ],
    BEHAVIOURAL: [
      {
        question: "Tell me about something you got wrong. What happened, and what changed afterwards?",
        probing: "Whether you can own a failure without either minimising it or performing contrition.",
        category: "BEHAVIOURAL",
        difficulty: "STANDARD",
        skeleton: [
          "The situation, briefly, and your actual role in it.",
          "The decision that was wrong and why it seemed right at the time.",
          "The cost, stated plainly.",
          "What you do differently now — with an example of having done it.",
        ],
      },
      {
        question: "Describe a disagreement with someone you had to keep working with.",
        probing: "How you handle friction when you cannot simply escalate or walk away.",
        category: "BEHAVIOURAL",
        difficulty: "STANDARD",
        skeleton: [
          "What the disagreement was actually about — the substance, not the personalities.",
          "What you did to understand their position.",
          "How it resolved, including if it resolved against you.",
        ],
      },
      {
        question: "Give me an example of work you delivered under a deadline you did not control.",
        probing: "Prioritisation under pressure, and whether you cut the right things.",
        category: "BEHAVIOURAL",
        difficulty: "STANDARD",
        skeleton: [
          "The constraint and what was at stake.",
          "What you chose to drop, and how you decided.",
          "The outcome, with a number if you have one.",
        ],
      },
    ],
    SITUATIONAL: [
      {
        question: "You are halfway through a task and realise the brief was wrong. What do you do?",
        probing: "Whether you raise problems early or quietly absorb them.",
        category: "SITUATIONAL",
        difficulty: "STANDARD",
        skeleton: [
          "What you check first before raising it.",
          "Who you tell, and how quickly.",
          "What you propose, rather than just reporting the problem.",
        ],
      },
    ],
    CLOSING: [
      {
        question: "What would you like to ask us?",
        probing: "Whether you have researched the work. The commonest way to lose a good interview at the end.",
        category: "CLOSING",
        difficulty: "WARM_UP",
        skeleton: [
          "One question about the work itself — what the first ninety days look like.",
          "One about how success is judged in the role.",
          "Nothing you could have answered from the website.",
        ],
      },
    ],
  };
}

/** Questions derived from the role's own guide. These are the valuable ones. */
function roleSpecific(role: RoleContext): Draft[] {
  const drafts: Draft[] = [];

  if (role.dayToDay) {
    drafts.push({
      // The guide's own sentence is quoted rather than spliced into a longer
      // one. Splicing produced things like "this role is largely most of the
      // day is reading existing code" — grammatical mush in the first line of
      // a mock interview, which undermines the whole exercise.
      question: `The guide for this role says: “${trimSentence(role.dayToDay)}” Which part of that are you weakest at, and what are you doing about it?`,
      probing: "Self-awareness against the real work, not the job title. Also whether you read the description.",
      category: "TECHNICAL",
      difficulty: "STRETCH",
      skeleton: [
        "Name a genuine weakness within the actual work — not a disguised strength.",
        "Evidence you already knew about it before this interview.",
        "The specific thing you are doing to close it, and how far along you are.",
      ],
    });
  }

  const hardPart = role.disadvantages[0];
  if (hardPart) {
    drafts.push({
      question: `People who leave this field often cite: ${trimSentence(hardPart)} How do you know that will not be you?`,
      probing: "Whether you have looked at the downside honestly or only at the salary figure.",
      category: "MOTIVATION",
      difficulty: "STRETCH",
      skeleton: [
        "Acknowledge it as real rather than arguing with the premise.",
        "Any direct exposure you have had to that pressure.",
        "What makes it tolerable for you specifically — be honest, not heroic.",
      ],
    });
  }

  if (role.regulated && role.licensingNote) {
    drafts.push({
      question: `This role is regulated. Talk me through where you are with registration and licensing.`,
      probing: "A factual gate. Getting this wrong ends the interview regardless of everything else.",
      category: "TECHNICAL",
      difficulty: "STANDARD",
      skeleton: [
        "Exactly which registration applies to you and your status with it.",
        "Dates, if you are mid-process.",
        "What you are permitted to do in the meantime — do not overstate this.",
      ],
    });
  }

  if (role.progression.length > 1) {
    drafts.push({
      question: `The usual ladder here runs ${role.progression.slice(0, 3).join(" → ")}. What does the step after this role require that you do not have yet?`,
      probing: "Whether you understand the profession's structure, and whether you are planning or drifting.",
      category: "MOTIVATION",
      difficulty: "STRETCH",
      skeleton: [
        "Name the specific requirement — experience, a qualification, a kind of exposure.",
        "How this role provides it.",
        "Roughly how long you expect that to take.",
      ],
    });
  }

  drafts.push({
    question: `Explain something technical from this field to someone who has never encountered it.`,
    probing: "Depth of understanding. You cannot simplify what you only half know.",
    category: "TECHNICAL",
    difficulty: "STRETCH",
    skeleton: [
      "Pick something you genuinely use, not the most impressive-sounding topic.",
      "One concrete analogy.",
      "Where the analogy breaks down — this is the part that shows you understand it.",
    ],
  });

  return drafts;
}

function trimSentence(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 200);
  return clean.endsWith(".") ? clean : `${clean}.`;
}

const ROUND_MIX: Record<InterviewRound, InterviewQuestion["category"][]> = {
  MIXED: ["OPENER", "MOTIVATION", "TECHNICAL", "BEHAVIOURAL", "SITUATIONAL", "CLOSING"],
  HR: ["OPENER", "MOTIVATION", "BEHAVIOURAL", "CLOSING"],
  TECHNICAL: ["TECHNICAL", "SITUATIONAL"],
  BEHAVIOURAL: ["BEHAVIOURAL", "SITUATIONAL"],
};

export function buildQuestionSet(input: {
  role: RoleContext | null;
  round: InterviewRound;
  count: number;
}): InterviewQuestion[] {
  const label = input.role?.label ?? "this field";
  const bank = genericBank(label);
  const specific = input.role ? roleSpecific(input.role) : [];
  const wanted = ROUND_MIX[input.round];

  // Per-category queues, role-specific questions first within each.
  const queues = new Map<InterviewQuestion["category"], Draft[]>();
  for (const category of wanted) {
    queues.set(category, [
      ...specific.filter((draft) => draft.category === category),
      ...(bank[category] ?? []),
    ]);
  }

  /*
   * Round-robin rather than category-by-category.
   *
   * Concatenating the queues and slicing produced a "full mock" that was four
   * motivation questions and nothing else — the role-specific questions all
   * land in one or two categories and swamped the slice. Taking one from each
   * category per pass guarantees the round's breadth before any category gets
   * a second question.
   */
  const picked: Draft[] = [];
  const seen = new Set<string>();
  let exhausted = false;

  while (picked.length < input.count && !exhausted) {
    exhausted = true;
    for (const category of wanted) {
      if (picked.length >= input.count) break;
      const queue = queues.get(category);
      const next = queue?.shift();
      if (!next) continue;
      exhausted = false;
      if (seen.has(next.question)) continue;
      seen.add(next.question);
      picked.push(next);
    }
  }

  return picked.map((draft, index) => ({ ...draft, index }));
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------


/**
 * Build a question set for a round.
 *
 * `buildQuestionSet` composes these from the role's own guide — its
 * responsibilities, its skills, the round being practised. A model used to
 * rewrite them into more naturally-worded questions when a key was present;
 * that is gone, along with the retrieval pass that grounded it. The questions
 * are now exactly what the rulebook writes, which means they are the same
 * questions every time and can be reviewed by a human before anybody sees them.
 */
export async function generateInterview(input: {
  targetSlug: string | null;
  targetLabel?: string;
  round: InterviewRound;
  count?: number;
}): Promise<{
  questions: InterviewQuestion[];
  provider: string;
  label: string;
  grounded: boolean;
}> {
  const count = input.count ?? 6;
  const role = await loadRole(input.targetSlug);
  const label = role?.label ?? input.targetLabel?.slice(0, 120) ?? "General interview";

  return {
    questions: buildQuestionSet({ role, round: input.round, count }),
    provider: "rulebook",
    label,
    grounded: Boolean(role),
  };
}


/*
 * STAR detection.
 *
 * Each marker is deliberately generic rather than a list of approved verbs. An
 * earlier version enumerated them — "built", "wrote", "led" — and scored a
 * strong answer at 25/100 because the candidate happened to say "pushed" and
 * "rolled back". Feedback that penalises vocabulary while claiming to measure
 * structure is worse than no feedback: the candidate rewrites the wrong thing.
 */
const STAR_MARKERS = {
  situation:
    /\b(when|while|during|at the time|the project|we were|i was|my (first|last|previous) (job|role|team)|last (year|month|week)|in \d{4})\b/i,
  task: /\b(my (job|role|responsibility|task)|i (had|needed|was asked|wanted|decided) to|the (goal|target|brief|deadline|problem) was|we needed)\b/i,
  // "I" followed by any past-tense verb, plus the common irregulars.
  action:
    /\bi\s+(\w+ed|went|took|ran|built|wrote|led|made|got|put|set|sent|spoke|told|brought|held|kept|left|met|paid|read|said|saw|sat|taught|thought|won|broke|chose|drove|flew|gave|grew|knew|rose|shipped|spent|stood|understood)\b/i,
  result:
    /\b(result|outcome|as a result|since then|afterwards|after that|in the end|ended up|which (meant|led|caused)|no (incidents|issues|complaints|repeats)|reduced|increased|saved|improved|grew|dropped|rose|shipped|delivered|passed|fixed|resolved|recovered|went from)\b/i,
};

const MARKER_ADVICE = {
  situation:
    "Open by anchoring it — where, when, and what was going on. Without that the panel cannot judge how hard it was.",
  task: "Say what you were actually on the hook for. Otherwise the achievement could belong to anyone in the room.",
  action:
    "Say what you personally did, in the past tense. This is the part interviewers listen hardest for.",
  result:
    "Finish on what happened. An answer that stops before the outcome leaves them to guess whether it worked.",
} as const;

export function scoreAnswer(input: {
  answer: string;
  question: InterviewQuestion;
}): { rubric: InterviewFeedback["rubric"]; score: number; facts: Record<string, number | boolean> } {
  const answer = input.answer.trim();
  const words = answer.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // --- structure -----------------------------------------------------------
  const markers = Object.entries(STAR_MARKERS).filter(([, pattern]) => pattern.test(answer));
  const structureScore = Math.round((markers.length / 4) * 100);
  const missingMarkers = Object.keys(STAR_MARKERS).filter(
    (key) => !markers.some(([found]) => found === key),
  );

  // --- specificity ---------------------------------------------------------
  const numbers = answer.match(/\b\d+(?:[.,]\d+)?\s*(?:%|percent|k\b|lakh|crore|hours?|days?|weeks?|months?|years?|people|users?|clients?|₹|\$)?/gi) ?? [];
  const properNouns = answer.match(/\b[A-Z][a-z]{2,}\b/g)?.filter((token) => !/^(I|The|We|My|This|That|When|While|After|Before|They|It)$/.test(token)) ?? [];
  const specificityScore = Math.min(
    100,
    numbers.length * 22 + Math.min(properNouns.length, 4) * 10,
  );

  // --- ownership -----------------------------------------------------------
  const iCount = (answer.match(/\bi\b/gi) ?? []).length;
  const weCount = (answer.match(/\bwe\b/gi) ?? []).length;
  const ownershipScore = (() => {
    if (iCount === 0 && weCount === 0) return 30;
    const ratio = iCount / Math.max(1, iCount + weCount);
    // Pure "I" reads as a glory hog; pure "we" hides what the person did.
    if (ratio >= 0.85 && weCount === 0 && iCount > 6) return 70;
    if (ratio >= 0.4) return 100;
    if (ratio >= 0.25) return 70;
    return 35;
  })();

  // --- length --------------------------------------------------------------
  // Roughly 130 words/minute spoken; a strong answer runs 60–150 seconds.
  const lengthScore =
    wordCount < 40 ? 25 : wordCount < 90 ? 70 : wordCount <= 330 ? 100 : wordCount <= 450 ? 65 : 35;

  // --- relevance -----------------------------------------------------------
  // Crudely stemmed on both sides. Comparing raw tokens marked "changed" as
  // absent from an answer that says "changes", which is not a relevance
  // problem — it is a suffix.
  const stem = (token: string) => token.replace(/(ing|ed|es|s)$/i, "");
  const questionTerms = [
    ...new Set(
      input.question.question
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((token) => token.length > 4)
        .map(stem),
    ),
  ];
  const answerStems = new Set(
    answer
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .map(stem),
  );
  const hit = questionTerms.filter((term) => answerStems.has(term));
  const relevanceScore = questionTerms.length
    ? Math.min(100, Math.round((hit.length / questionTerms.length) * 140))
    : 60;

  const rubric: InterviewFeedback["rubric"] = [
    {
      key: "structure",
      label: "Structure",
      score: structureScore,
      // The advice has to name the beat that is actually missing. A fixed
      // sentence about the result, printed when the result was the one thing
      // present, teaches the candidate to fix the wrong end of the answer.
      comment: missingMarkers.length
        ? `Missing ${missingMarkers.join(", ")}. ${MARKER_ADVICE[missingMarkers[0] as keyof typeof MARKER_ADVICE]}`
        : "Situation, task, action and result are all present.",
    },
    {
      key: "specificity",
      label: "Specifics",
      score: specificityScore,
      comment: numbers.length
        ? `${numbers.length} concrete figures. That is what makes an answer memorable an hour later.`
        : "No numbers anywhere. Add scale — how many, how long, how much — even approximate.",
    },
    {
      key: "ownership",
      label: "Ownership",
      score: ownershipScore,
      comment:
        weCount > iCount * 2
          ? `“We” appears ${weCount} times against ${iCount} “I”. The panel cannot tell what you personally did.`
          : iCount === 0
            ? "You never say what you did. Even in team work, name your part."
            : "Your own contribution is clear.",
    },
    {
      key: "length",
      label: "Length",
      score: lengthScore,
      comment:
        wordCount < 90
          ? `About ${wordCount} words — roughly ${Math.max(1, Math.round((wordCount / 130) * 60))} seconds. Too short; the panel will have to dig.`
          : wordCount > 450
            ? `About ${wordCount} words — over three minutes spoken. You will lose them. Cut the setup, keep the result.`
            : `About ${wordCount} words, near ninety seconds spoken. Good length.`,
    },
    {
      key: "relevance",
      label: "Answers the question",
      score: relevanceScore,
      // Threshold matched to the strong/weak split used for the summary
      // columns, so a row is never praised in text and listed under "not
      // working" at the same time.
      comment:
        relevanceScore >= 80
          ? "Stays on what was asked."
          : relevanceScore >= 50
            ? "Mostly on topic, but it does not pick up everything the question asked for — check the second half of it."
            : "Drifts from the question. Interviewers read that as either not listening or dodging.",
    },
  ];

  const weights: Record<string, number> = {
    structure: 2, specificity: 2.5, ownership: 1.5, length: 1, relevance: 2,
  };
  const total = rubric.reduce((sum, row) => sum + weights[row.key], 0);
  const score = Math.round(rubric.reduce((sum, row) => sum + row.score * weights[row.key], 0) / total);

  return {
    rubric,
    score,
    facts: { wordCount, numbers: numbers.length, iCount, weCount, markers: markers.length },
  };
}

function deterministicFeedback(
  scored: ReturnType<typeof scoreAnswer>,
  question: InterviewQuestion,
  answer: string,
): InterviewFeedback {
  // The two thresholds have to meet, or a row scoring 70–79 lands in neither
  // bucket and the panel reports "nothing the rulebook flags" about an answer
  // it has just marked down.
  const strong = scored.rubric.filter((row) => row.score >= 80);
  const weak = scored.rubric.filter((row) => row.score < 80).sort((a, b) => a.score - b.score);

  return {
    score: scored.score,
    rubric: scored.rubric,
    strengths: strong.length
      ? strong.map((row) => `${row.label}: ${row.comment}`)
      : ["You put an answer down, which is the only way this gets better."],
    gaps: weak.length
      ? weak.map((row) => `${row.label}: ${row.comment}`)
      : ["Nothing the rulebook flags. Practise it out loud and time yourself."],
    improvedAnswer: [
      "Rework your own answer against this shape — the wording should stay yours:",
      "",
      ...question.skeleton.map((beat, index) => `${index + 1}. ${beat}`),
      "",
      scored.facts.numbers === 0
        ? "Add at least one number. If you do not remember the exact figure, an honest approximation (\"around 40 a week\") is fine and far better than none."
        : "Keep the figures you used — they are doing the work here.",
      "",
      // Plain text: this string is rendered as-is, so markdown emphasis marks
      // would show up literally.
      "This is a structural prompt, not a rewrite of your wording — it points at the beat that is missing so the answer stays yours.",
    ].join("\n"),
    followUps: [
      "What would you have done differently?",
      "Who disagreed with you at the time?",
      "How did you know it had worked?",
    ],
  };
}


/**
 * Score an answer and say what is weak about it.
 *
 * The score and the rubric were always the rulebook's — a model was never
 * allowed to touch them, because two attempts at the same answer have to be
 * comparable. What the model used to add was the rewritten answer and the
 * follow-up questions. Those are gone: a rewrite that keeps somebody's facts
 * and voice is precisely the thing a model gets subtly wrong, and precisely
 * what a mentor is good at.
 */
export function gradeAnswer(input: {
  question: InterviewQuestion;
  answer: string;
  targetLabel: string;
}): { feedback: InterviewFeedback; provider: string } {
  const scored = scoreAnswer({ answer: input.answer, question: input.question });
  return {
    feedback: deterministicFeedback(scored, input.question, input.answer),
    provider: "rulebook",
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export async function saveSession(input: {
  userId: string;
  targetSlug: string | null;
  targetLabel: string;
  round: InterviewRound;
  questions: InterviewQuestion[];
  provider: string;
}) {
  const [row] = await db
    .insert(interviewSessions)
    .values({
      userId: input.userId,
      targetKind: input.targetSlug ? "career" : "general",
      targetSlug: input.targetSlug,
      targetLabel: input.targetLabel,
      round: input.round,
      questions: input.questions,
      // The column stays for the sessions that already have rows in it. Nothing
      // writes citations any more: they came from the retrieval pass that fed
      // the model, and both are gone.
      citations: null,
      provider: input.provider,
    })
    .returning();
  return row;
}

export async function getSessionForUser(sessionId: string, userId: string) {
  const row = await db.query.interviewSessions.findFirst({
    where: eq(interviewSessions.id, sessionId),
  });
  if (!row) throw new NotFoundError("That practice session doesn't exist.");
  if (row.userId !== userId) throw new ForbiddenError("That practice session isn't yours.");
  return row;
}

export async function saveAnswer(input: {
  sessionId: string;
  userId: string;
  questionIndex: number;
  answer: string;
  feedback: InterviewFeedback;
  provider: string;
}) {
  const [row] = await db
    .insert(interviewAnswers)
    .values({
      sessionId: input.sessionId,
      userId: input.userId,
      questionIndex: input.questionIndex,
      answer: input.answer,
      feedback: input.feedback,
      provider: input.provider,
    })
    // Re-answering a question replaces the attempt. Otherwise "your score"
    // would depend on which of several attempts happened to be read.
    .onConflictDoUpdate({
      target: [interviewAnswers.sessionId, interviewAnswers.questionIndex],
      set: {
        answer: input.answer,
        feedback: input.feedback,
        provider: input.provider,
        createdAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function listAnswers(sessionId: string) {
  return db
    .select()
    .from(interviewAnswers)
    .where(eq(interviewAnswers.sessionId, sessionId))
    .orderBy(interviewAnswers.questionIndex);
}

export async function listSessions(userId: string, limit = 20) {
  return db
    .select({
      id: interviewSessions.id,
      targetLabel: interviewSessions.targetLabel,
      targetSlug: interviewSessions.targetSlug,
      round: interviewSessions.round,
      createdAt: interviewSessions.createdAt,
      questions: interviewSessions.questions,
    })
    .from(interviewSessions)
    .where(eq(interviewSessions.userId, userId))
    .limit(limit);
}
