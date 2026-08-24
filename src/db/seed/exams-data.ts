/**
 * India government examination corpus.
 *
 * Structure (stages, selection process, broad eligibility shape) is accurate to
 * the author's knowledge and sourced to the recruiting body. Cycle-specific
 * facts — dates, vacancy counts, fees — are deliberately NOT seeded as
 * published data, because seeding a plausible-looking date is exactly the
 * failure mode this platform exists to avoid. Editions are created empty and
 * must be filled from the official notification through the admin review queue.
 */

export type ExamSeed = {
  slug: string;
  name: string;
  shortName: string;
  organisation: { shortName: string; name: string; type: string; website: string };
  category: string;
  sourceKey: string;
  description: string;
  eligibility: { label: string; detail: string }[];
  ageLimit: { min?: number; max?: number; relaxations?: { group: string; years: number }[]; note?: string };
  nationality: string;
  educationRequirement: string;
  applicationProcess: string;
  officialWebsite: string;
  preparationMonths: number;
  difficulty: "MEDIUM" | "HIGH" | "VERY_HIGH";
  competitionNote: string;
  stages: {
    name: string;
    pattern: { paper: string; marks?: number; questions?: number; durationMinutes?: number; note?: string }[];
    durationMinutes?: number;
    marksTotal?: number;
    negativeMarking?: boolean;
    negativeMarkingRatio?: string;
    isQualifyingOnly?: boolean;
  }[];
  selection: { name: string; description: string }[];
  syllabus: { subject: string; topics: { topic: string; weight: number }[] }[];
  pay?: { postName: string; payLevel?: string; grossMin?: number; grossMax?: number; note?: string }[];
  resources: {
    kind: string;
    title: string;
    author?: string;
    publisher?: string;
    url?: string;
    budgetTier: "free" | "low" | "standard";
    costNote?: string;
    note?: string;
  }[];
};

export const EXAMS: ExamSeed[] = [
  {
    slug: "upsc-cse",
    name: "UPSC Civil Services Examination",
    shortName: "UPSC CSE",
    organisation: {
      shortName: "UPSC",
      name: "Union Public Service Commission",
      type: "central",
      website: "https://upsc.gov.in",
    },
    category: "civil-services",
    sourceKey: "upsc",
    description:
      "The recruitment examination for the Indian Administrative Service, Indian Police Service, Indian Foreign Service and other central services. Conducted annually in three stages, and widely regarded as the most competitive examination in India.",
    eligibility: [
      { label: "Education", detail: "A bachelor's degree in any discipline from a recognised university. Final-year students may apply for the Preliminary examination." },
      { label: "Attempts", detail: "A limited number of attempts, varying by category. Confirm the exact limit in the current year's notification." },
      { label: "Physical standards", detail: "Applies to the IPS and certain other services; specified in the notification." },
    ],
    ageLimit: {
      min: 21,
      max: 32,
      relaxations: [
        { group: "OBC", years: 3 },
        { group: "SC/ST", years: 5 },
        { group: "Persons with benchmark disability", years: 10 },
      ],
      note: "Age is reckoned as on a cut-off date specified in the notification. Confirm the current limits and relaxations directly with UPSC.",
    },
    nationality:
      "Indian citizenship is required for the IAS and IPS. Other services admit certain other categories as specified in the notification.",
    educationRequirement: "Bachelor's degree in any discipline from a recognised university.",
    applicationProcess:
      "Apply online through the UPSC online application portal during the window announced in the notification. Registration is a two-part process, and the fee is paid online or at a designated bank.",
    officialWebsite: "https://upsc.gov.in",
    preparationMonths: 18,
    difficulty: "VERY_HIGH",
    competitionNote:
      "Around a million candidates register each year for roughly a thousand posts. Fewer than one in a thousand applicants are finally recommended.",
    stages: [
      {
        name: "Preliminary Examination",
        pattern: [
          { paper: "General Studies Paper I", marks: 200, questions: 100, durationMinutes: 120 },
          { paper: "CSAT Paper II (qualifying)", marks: 200, questions: 80, durationMinutes: 120, note: "Qualifying only — you must score 33% but the marks do not count towards the merit list." },
        ],
        marksTotal: 400,
        negativeMarking: true,
        negativeMarkingRatio: "One third of the marks assigned to that question",
        isQualifyingOnly: true,
      },
      {
        name: "Main Examination",
        pattern: [
          { paper: "Paper A — Indian Language (qualifying)", marks: 300, durationMinutes: 180 },
          { paper: "Paper B — English (qualifying)", marks: 300, durationMinutes: 180 },
          { paper: "Essay", marks: 250, durationMinutes: 180 },
          { paper: "General Studies I", marks: 250, durationMinutes: 180 },
          { paper: "General Studies II", marks: 250, durationMinutes: 180 },
          { paper: "General Studies III", marks: 250, durationMinutes: 180 },
          { paper: "General Studies IV (Ethics)", marks: 250, durationMinutes: 180 },
          { paper: "Optional Paper I", marks: 250, durationMinutes: 180 },
          { paper: "Optional Paper II", marks: 250, durationMinutes: 180 },
        ],
        marksTotal: 1750,
        negativeMarking: false,
      },
      {
        name: "Personality Test (Interview)",
        pattern: [{ paper: "Interview before a board", marks: 275, note: "Assesses suitability for a career in public service." }],
        marksTotal: 275,
        negativeMarking: false,
      },
    ],
    selection: [
      { name: "Preliminary Examination", description: "A screening test. Marks do not carry forward to the final merit list." },
      { name: "Main Examination", description: "Nine descriptive papers; seven count towards the merit list." },
      { name: "Personality Test", description: "An interview before a board, assessing suitability for public service." },
      { name: "Final merit list", description: "Based on Mains (1750) plus Interview (275), out of 2025 marks." },
      { name: "Service allocation", description: "Determined by rank and the preferences submitted by the candidate." },
    ],
    syllabus: [
      {
        subject: "Indian Polity & Governance",
        topics: [
          { topic: "Constitution — features, preamble, schedules", weight: 5 },
          { topic: "Fundamental Rights, Duties and Directive Principles", weight: 5 },
          { topic: "Parliament and state legislatures", weight: 4 },
          { topic: "Judiciary and judicial review", weight: 4 },
          { topic: "Federalism and centre-state relations", weight: 4 },
          { topic: "Constitutional and statutory bodies", weight: 3 },
          { topic: "Local governance and panchayati raj", weight: 3 },
          { topic: "Governance, transparency and accountability", weight: 3 },
        ],
      },
      {
        subject: "History",
        topics: [
          { topic: "Ancient and medieval India", weight: 3 },
          { topic: "Modern India and the freedom struggle", weight: 5 },
          { topic: "Post-independence consolidation", weight: 3 },
          { topic: "Art and culture", weight: 3 },
          { topic: "World history — industrial revolution, world wars, decolonisation", weight: 3 },
        ],
      },
      {
        subject: "Geography",
        topics: [
          { topic: "Physical geography of the world", weight: 4 },
          { topic: "Indian geography — physical, economic, social", weight: 4 },
          { topic: "Resource distribution and industrial location", weight: 3 },
          { topic: "Climatology and oceanography", weight: 3 },
        ],
      },
      {
        subject: "Economy",
        topics: [
          { topic: "Basic macroeconomic concepts", weight: 4 },
          { topic: "Planning, growth and development", weight: 4 },
          { topic: "Budget, fiscal and monetary policy", weight: 4 },
          { topic: "Agriculture and food security", weight: 3 },
          { topic: "Inclusive growth and social sector", weight: 3 },
        ],
      },
      {
        subject: "Environment & Ecology",
        topics: [
          { topic: "Biodiversity and conservation", weight: 3 },
          { topic: "Climate change and international agreements", weight: 3 },
          { topic: "Environmental pollution and impact assessment", weight: 2 },
        ],
      },
      {
        subject: "Science & Technology",
        topics: [
          { topic: "Developments in science and technology", weight: 3 },
          { topic: "Space, defence and nuclear technology", weight: 3 },
          { topic: "Biotechnology and IT", weight: 2 },
        ],
      },
      {
        subject: "Ethics (GS IV)",
        topics: [
          { topic: "Ethics, integrity and aptitude", weight: 4 },
          { topic: "Attitude, emotional intelligence", weight: 3 },
          { topic: "Public service values and probity", weight: 4 },
          { topic: "Case studies", weight: 5 },
        ],
      },
      {
        subject: "Current Affairs",
        topics: [
          { topic: "Daily newspaper reading", weight: 5 },
          { topic: "Government schemes and policies", weight: 4 },
          { topic: "International relations", weight: 4 },
          { topic: "Reports and indices", weight: 2 },
        ],
      },
      {
        subject: "CSAT (Paper II)",
        topics: [
          { topic: "Comprehension", weight: 3 },
          { topic: "Logical reasoning and analytical ability", weight: 3 },
          { topic: "Basic numeracy (Class 10 level)", weight: 3 },
        ],
      },
      {
        subject: "Answer Writing & Essay",
        topics: [
          { topic: "Structured answer writing practice", weight: 5 },
          { topic: "Essay writing practice", weight: 4 },
        ],
      },
    ],
    pay: [
      { postName: "IAS / IPS / IFS (entry)", payLevel: "Level 10", grossMin: 56_100, grossMax: 90_000, note: "Basic pay at entry plus allowances; figures vary by posting. Confirm with the current pay commission tables." },
    ],
    resources: [
      { kind: "official", title: "UPSC official notification and syllabus", url: "https://upsc.gov.in", budgetTier: "free", note: "Read this before buying anything. Most wasted preparation comes from not knowing the syllabus." },
      { kind: "free_resource", title: "NCERT textbooks, Class 6–12", url: "https://ncert.nic.in/textbook.php", budgetTier: "free", note: "Free PDFs from NCERT. The standard foundation for this exam." },
      { kind: "free_resource", title: "Press Information Bureau releases", url: "https://pib.gov.in", budgetTier: "free", note: "Primary source for government schemes and policy announcements." },
      { kind: "book", title: "Indian Polity", author: "M. Laxmikanth", budgetTier: "low", costNote: "Widely available; check current price before ordering.", note: "The standard reference for the polity section." },
      { kind: "book", title: "India's Struggle for Independence", author: "Bipan Chandra", budgetTier: "low", costNote: "Check current price.", note: "Standard text for modern Indian history." },
      { kind: "book", title: "Certificate Physical and Human Geography", author: "G.C. Leong", budgetTier: "low", costNote: "Check current price.", note: "Standard geography reference." },
      { kind: "book", title: "Indian Economy", author: "Ramesh Singh", budgetTier: "low", costNote: "Check current price." },
      { kind: "practice", title: "UPSC previous year question papers", url: "https://upsc.gov.in", budgetTier: "free", note: "Available free on the UPSC site. Solve at least ten years' worth." },
      { kind: "coaching", title: "Full-time coaching programmes", budgetTier: "standard", costNote: "Typically ₹1–2 lakh for a full course; varies widely.", note: "Optional. A substantial share of successful candidates prepare without it — decide based on whether you need external structure, not on fear." },
    ],
  },
  {
    slug: "ssc-cgl",
    name: "SSC Combined Graduate Level Examination",
    shortName: "SSC CGL",
    organisation: {
      shortName: "SSC",
      name: "Staff Selection Commission",
      type: "central",
      website: "https://ssc.gov.in",
    },
    category: "ssc",
    sourceKey: "ssc",
    description:
      "Recruitment for Group B and Group C posts across central government ministries and departments — including Income Tax Inspector, Excise Inspector, Assistant Section Officer and Auditor. One of the highest-volume graduate recruitment exams in India.",
    eligibility: [
      { label: "Education", detail: "A bachelor's degree in any discipline. Some posts have additional subject requirements — for example, Statistical Investigator posts require Statistics at graduation level." },
      { label: "Post preferences", detail: "Candidates indicate post preferences during application; allocation depends on rank and vacancy." },
    ],
    ageLimit: {
      min: 18,
      max: 32,
      relaxations: [
        { group: "OBC", years: 3 },
        { group: "SC/ST", years: 5 },
        { group: "PwD", years: 10 },
      ],
      note: "Age limits vary by post — some are 18–27, others 20–30 or 18–32. Check the post-wise table in the current notification.",
    },
    nationality: "Indian citizen, or as otherwise specified in the notification.",
    educationRequirement: "Bachelor's degree in any discipline from a recognised university.",
    applicationProcess:
      "Apply online through the SSC portal. One-time registration is required, then the exam-specific application during the announced window.",
    officialWebsite: "https://ssc.gov.in",
    preparationMonths: 10,
    difficulty: "HIGH",
    competitionNote:
      "Typically several lakh applicants for a few thousand posts. Competitive, but with far better odds than UPSC.",
    stages: [
      {
        name: "Tier I — Computer Based Examination",
        pattern: [
          { paper: "General Intelligence and Reasoning", marks: 50, questions: 25 },
          { paper: "General Awareness", marks: 50, questions: 25 },
          { paper: "Quantitative Aptitude", marks: 50, questions: 25 },
          { paper: "English Comprehension", marks: 50, questions: 25 },
        ],
        durationMinutes: 60,
        marksTotal: 200,
        negativeMarking: true,
        negativeMarkingRatio: "0.50 marks per wrong answer",
        isQualifyingOnly: true,
      },
      {
        name: "Tier II — Computer Based Examination",
        pattern: [
          { paper: "Session I — Mathematical Abilities, Reasoning, English, General Awareness, Computer Knowledge", durationMinutes: 150 },
          { paper: "Session II — Data Entry Speed Test", durationMinutes: 15, note: "Applicable to certain posts." },
          { paper: "Paper II — Statistics", note: "For Junior Statistical Officer posts only." },
          { paper: "Paper III — General Studies (Finance & Economics)", note: "For Assistant Audit Officer / Assistant Accounts Officer posts only." },
        ],
        negativeMarking: true,
        negativeMarkingRatio: "1 mark per wrong answer in most sections",
      },
    ],
    selection: [
      { name: "Tier I", description: "Screening test; marks do not carry to the final merit for most posts." },
      { name: "Tier II", description: "The decisive stage for most posts, with post-specific papers." },
      { name: "Document verification", description: "Verification of eligibility, category and educational documents." },
      { name: "Post allocation", description: "Based on merit, category and the preferences submitted." },
    ],
    syllabus: [
      {
        subject: "Quantitative Aptitude",
        topics: [
          { topic: "Number system and simplification", weight: 3 },
          { topic: "Percentage, profit and loss, discount", weight: 4 },
          { topic: "Ratio, proportion, partnership", weight: 3 },
          { topic: "Time, speed, distance and work", weight: 4 },
          { topic: "Simple and compound interest", weight: 3 },
          { topic: "Algebra", weight: 4 },
          { topic: "Geometry and mensuration", weight: 4 },
          { topic: "Trigonometry", weight: 4 },
          { topic: "Data interpretation", weight: 3 },
        ],
      },
      {
        subject: "General Intelligence & Reasoning",
        topics: [
          { topic: "Analogies and classification", weight: 3 },
          { topic: "Series — number and alphabet", weight: 3 },
          { topic: "Coding-decoding", weight: 2 },
          { topic: "Blood relations and direction sense", weight: 2 },
          { topic: "Syllogism and statement-conclusion", weight: 3 },
          { topic: "Non-verbal reasoning — figures, mirror images, paper folding", weight: 3 },
        ],
      },
      {
        subject: "English Language",
        topics: [
          { topic: "Reading comprehension", weight: 4 },
          { topic: "Grammar — error spotting, sentence improvement", weight: 4 },
          { topic: "Vocabulary — synonyms, antonyms, idioms", weight: 4 },
          { topic: "Cloze test and para jumbles", weight: 3 },
          { topic: "Fill in the blanks and one-word substitution", weight: 3 },
        ],
      },
      {
        subject: "General Awareness",
        topics: [
          { topic: "Indian history and culture", weight: 3 },
          { topic: "Geography", weight: 3 },
          { topic: "Indian polity", weight: 3 },
          { topic: "Economy", weight: 3 },
          { topic: "General science", weight: 3 },
          { topic: "Current affairs", weight: 4 },
          { topic: "Static GK — awards, sports, books", weight: 2 },
        ],
      },
      {
        subject: "Computer Knowledge (Tier II)",
        topics: [
          { topic: "Computer basics and organisation", weight: 2 },
          { topic: "MS Office and internet fundamentals", weight: 2 },
        ],
      },
    ],
    pay: [
      { postName: "Assistant Audit Officer", payLevel: "Level 8", grossMin: 47_600, grossMax: 1_51_100, note: "Pay band per the applicable pay commission; confirm current figures." },
      { postName: "Income Tax Inspector", payLevel: "Level 7", grossMin: 44_900, grossMax: 1_42_400 },
      { postName: "Assistant Section Officer", payLevel: "Level 7", grossMin: 44_900, grossMax: 1_42_400 },
      { postName: "Upper Division Clerk", payLevel: "Level 4", grossMin: 25_500, grossMax: 81_100 },
    ],
    resources: [
      { kind: "official", title: "SSC official notification and syllabus", url: "https://ssc.gov.in", budgetTier: "free" },
      { kind: "practice", title: "SSC previous year papers", url: "https://ssc.gov.in", budgetTier: "free", note: "The single highest-value free resource for this exam. Patterns repeat." },
      { kind: "book", title: "Quantitative Aptitude for Competitive Examinations", author: "R.S. Aggarwal", budgetTier: "low", costNote: "Check current price." },
      { kind: "book", title: "A Mirror of Common Errors", author: "Ashok Kumar Singh", budgetTier: "low", costNote: "Check current price.", note: "Widely used for the English grammar section." },
      { kind: "book", title: "Fast Track Objective Arithmetic", author: "Rajesh Verma", budgetTier: "low", costNote: "Check current price." },
      { kind: "free_resource", title: "Free mock test platforms", budgetTier: "free", note: "Several platforms offer free SSC mocks. Weekly timed mocks matter more than any book." },
    ],
  },
  {
    slug: "ssc-chsl",
    name: "SSC Combined Higher Secondary Level Examination",
    shortName: "SSC CHSL",
    organisation: { shortName: "SSC", name: "Staff Selection Commission", type: "central", website: "https://ssc.gov.in" },
    category: "ssc",
    sourceKey: "ssc",
    description:
      "Recruitment for Lower Division Clerk, Junior Secretariat Assistant and Data Entry Operator posts in central government departments. Open to Class 12 pass candidates — one of the few central government routes that does not require a degree.",
    eligibility: [
      { label: "Education", detail: "Class 12 pass or equivalent from a recognised board. Some Data Entry Operator posts require Science with Mathematics." },
    ],
    ageLimit: {
      min: 18,
      max: 27,
      relaxations: [
        { group: "OBC", years: 3 },
        { group: "SC/ST", years: 5 },
        { group: "PwD", years: 10 },
      ],
      note: "Confirm the cut-off date and current relaxations in the notification.",
    },
    nationality: "Indian citizen, or as specified in the notification.",
    educationRequirement: "Class 12 pass from a recognised board.",
    applicationProcess: "Online through the SSC portal after one-time registration.",
    officialWebsite: "https://ssc.gov.in",
    preparationMonths: 8,
    difficulty: "MEDIUM",
    competitionNote: "Very high applicant volume, but a genuine route into central government service without a degree.",
    stages: [
      {
        name: "Tier I — Computer Based Examination",
        pattern: [
          { paper: "General Intelligence", marks: 50, questions: 25 },
          { paper: "General Awareness", marks: 50, questions: 25 },
          { paper: "Quantitative Aptitude", marks: 50, questions: 25 },
          { paper: "English Language", marks: 50, questions: 25 },
        ],
        durationMinutes: 60,
        marksTotal: 200,
        negativeMarking: true,
        negativeMarkingRatio: "0.50 marks per wrong answer",
      },
      {
        name: "Tier II — Computer Based Examination",
        pattern: [
          { paper: "Mathematical Abilities, Reasoning, English, General Awareness, Computer Knowledge" },
          { paper: "Skill Test / Typing Test", note: "Qualifying; speed requirements differ by post." },
        ],
        negativeMarking: true,
        negativeMarkingRatio: "1 mark per wrong answer",
      },
    ],
    selection: [
      { name: "Tier I", description: "Objective screening test." },
      { name: "Tier II", description: "Objective paper plus a qualifying skill or typing test." },
      { name: "Document verification", description: "Eligibility and category verification." },
    ],
    syllabus: [
      {
        subject: "Quantitative Aptitude",
        topics: [
          { topic: "Number system and simplification", weight: 3 },
          { topic: "Percentage, profit and loss", weight: 3 },
          { topic: "Ratio, average, mixture", weight: 3 },
          { topic: "Time, work, speed and distance", weight: 3 },
          { topic: "Mensuration and geometry", weight: 3 },
          { topic: "Data interpretation", weight: 2 },
        ],
      },
      {
        subject: "General Intelligence",
        topics: [
          { topic: "Analogy and classification", weight: 2 },
          { topic: "Series completion", weight: 2 },
          { topic: "Coding-decoding", weight: 2 },
          { topic: "Non-verbal reasoning", weight: 2 },
        ],
      },
      {
        subject: "English Language",
        topics: [
          { topic: "Grammar and error detection", weight: 3 },
          { topic: "Vocabulary", weight: 3 },
          { topic: "Comprehension", weight: 3 },
          { topic: "Sentence rearrangement", weight: 2 },
        ],
      },
      {
        subject: "General Awareness",
        topics: [
          { topic: "Current affairs", weight: 3 },
          { topic: "History, geography, polity, economy basics", weight: 3 },
          { topic: "General science", weight: 2 },
        ],
      },
      {
        subject: "Typing / Data Entry Skill",
        topics: [{ topic: "Typing speed practice", weight: 3 }],
      },
    ],
    pay: [
      { postName: "Lower Division Clerk / JSA", payLevel: "Level 2", grossMin: 19_900, grossMax: 63_200 },
      { postName: "Data Entry Operator", payLevel: "Level 4", grossMin: 25_500, grossMax: 81_100 },
    ],
    resources: [
      { kind: "official", title: "SSC official notification", url: "https://ssc.gov.in", budgetTier: "free" },
      { kind: "practice", title: "Previous year CHSL papers", url: "https://ssc.gov.in", budgetTier: "free" },
      { kind: "free_resource", title: "Free typing practice tools", budgetTier: "free", note: "The typing test is qualifying but people do fail it. Practise from month one." },
      { kind: "book", title: "Quantitative Aptitude", author: "R.S. Aggarwal", budgetTier: "low", costNote: "Check current price." },
    ],
  },
  {
    slug: "ibps-po",
    name: "IBPS Probationary Officer Examination",
    shortName: "IBPS PO",
    organisation: {
      shortName: "IBPS",
      name: "Institute of Banking Personnel Selection",
      type: "central",
      website: "https://www.ibps.in",
    },
    category: "banking",
    sourceKey: "ibps",
    description:
      "Common recruitment process for Probationary Officer and Management Trainee posts across participating public sector banks. Three stages: preliminary, main, and interview.",
    eligibility: [
      { label: "Education", detail: "A bachelor's degree in any discipline from a recognised university, with a valid mark sheet on the date specified." },
      { label: "Computer literacy", detail: "Operating and working knowledge of computers is required." },
      { label: "Language", detail: "Proficiency in the official language of the state or union territory applied for is generally expected." },
    ],
    ageLimit: {
      min: 20,
      max: 30,
      relaxations: [
        { group: "OBC", years: 3 },
        { group: "SC/ST", years: 5 },
        { group: "PwD", years: 10 },
      ],
      note: "Confirm the cut-off date in the current notification.",
    },
    nationality: "Indian citizen, or as specified in the notification.",
    educationRequirement: "Bachelor's degree in any discipline.",
    applicationProcess: "Online through the IBPS website during the announced registration window.",
    officialWebsite: "https://www.ibps.in",
    preparationMonths: 8,
    difficulty: "HIGH",
    competitionNote: "Several lakh applicants annually. Speed and accuracy under time pressure decide outcomes more than depth of knowledge.",
    stages: [
      {
        name: "Preliminary Examination",
        pattern: [
          { paper: "English Language", marks: 30, questions: 30, durationMinutes: 20 },
          { paper: "Quantitative Aptitude", marks: 35, questions: 35, durationMinutes: 20 },
          { paper: "Reasoning Ability", marks: 35, questions: 35, durationMinutes: 20 },
        ],
        durationMinutes: 60,
        marksTotal: 100,
        negativeMarking: true,
        negativeMarkingRatio: "0.25 marks per wrong answer",
        isQualifyingOnly: true,
      },
      {
        name: "Main Examination",
        pattern: [
          { paper: "Reasoning & Computer Aptitude", marks: 60, questions: 45, durationMinutes: 60 },
          { paper: "General / Economy / Banking Awareness", marks: 40, questions: 40, durationMinutes: 35 },
          { paper: "English Language", marks: 40, questions: 35, durationMinutes: 40 },
          { paper: "Data Analysis & Interpretation", marks: 60, questions: 35, durationMinutes: 45 },
          { paper: "English Letter & Essay (descriptive)", marks: 25, durationMinutes: 30 },
        ],
        marksTotal: 225,
        negativeMarking: true,
        negativeMarkingRatio: "0.25 marks per wrong answer in objective sections",
      },
      {
        name: "Interview",
        pattern: [{ paper: "Personal interview", marks: 100 }],
        marksTotal: 100,
      },
    ],
    selection: [
      { name: "Preliminary", description: "Screening only; marks do not carry forward." },
      { name: "Main", description: "Objective plus descriptive; counts towards the final score." },
      { name: "Interview", description: "Conducted by participating banks." },
      { name: "Provisional allotment", description: "Final score is weighted 80% Main and 20% Interview; allotment follows merit and preference." },
    ],
    syllabus: [
      {
        subject: "Quantitative Aptitude",
        topics: [
          { topic: "Simplification and approximation", weight: 3 },
          { topic: "Number series", weight: 3 },
          { topic: "Quadratic equations", weight: 2 },
          { topic: "Data interpretation — tables, graphs, caselets", weight: 5 },
          { topic: "Arithmetic word problems", weight: 4 },
          { topic: "Data sufficiency", weight: 2 },
        ],
      },
      {
        subject: "Reasoning Ability",
        topics: [
          { topic: "Puzzles and seating arrangement", weight: 5 },
          { topic: "Syllogism", weight: 3 },
          { topic: "Inequality", weight: 2 },
          { topic: "Blood relations and direction", weight: 2 },
          { topic: "Input-output and coding-decoding", weight: 3 },
          { topic: "Data sufficiency and logical reasoning", weight: 3 },
        ],
      },
      {
        subject: "English Language",
        topics: [
          { topic: "Reading comprehension", weight: 4 },
          { topic: "Cloze test and fillers", weight: 3 },
          { topic: "Error detection and sentence improvement", weight: 3 },
          { topic: "Para jumbles", weight: 2 },
          { topic: "Descriptive writing — letter and essay", weight: 3 },
        ],
      },
      {
        subject: "Banking & Economy Awareness",
        topics: [
          { topic: "Banking terms and RBI functions", weight: 4 },
          { topic: "Financial and economic current affairs", weight: 4 },
          { topic: "Government schemes and budget", weight: 3 },
          { topic: "Static banking GK", weight: 2 },
        ],
      },
      {
        subject: "Computer Aptitude",
        topics: [{ topic: "Computer fundamentals and networking basics", weight: 2 }],
      },
    ],
    pay: [
      { postName: "Probationary Officer (Scale I)", grossMin: 52_000, grossMax: 63_000, note: "Approximate gross including allowances; varies by bank and city. Confirm with the bank." },
    ],
    resources: [
      { kind: "official", title: "IBPS official notification", url: "https://www.ibps.in", budgetTier: "free" },
      { kind: "free_resource", title: "RBI website — banking awareness", url: "https://rbi.org.in", budgetTier: "free", note: "Primary source for banking policy and terminology." },
      { kind: "book", title: "Quantitative Aptitude for Competitive Examinations", author: "R.S. Aggarwal", budgetTier: "low", costNote: "Check current price." },
      { kind: "book", title: "A Modern Approach to Verbal & Non-Verbal Reasoning", author: "R.S. Aggarwal", budgetTier: "low", costNote: "Check current price." },
      { kind: "practice", title: "Daily timed sectional mocks", budgetTier: "free", note: "Sectional timing is the defining constraint of this exam. Practise against the clock from day one." },
    ],
  },
  {
    slug: "sbi-po",
    name: "SBI Probationary Officer Examination",
    shortName: "SBI PO",
    organisation: {
      shortName: "SBI",
      name: "State Bank of India",
      type: "psu",
      website: "https://sbi.co.in/careers",
    },
    category: "banking",
    sourceKey: "ibps",
    description:
      "State Bank of India's own Probationary Officer recruitment, conducted separately from IBPS. Widely regarded as tougher than IBPS PO, with a group exercise added at the final stage.",
    eligibility: [
      { label: "Education", detail: "Graduation in any discipline from a recognised university. Final-year students may apply subject to conditions in the notification." },
    ],
    ageLimit: {
      min: 21,
      max: 30,
      relaxations: [
        { group: "OBC", years: 3 },
        { group: "SC/ST", years: 5 },
        { group: "PwD", years: 10 },
      ],
    },
    nationality: "Indian citizen, or as specified in the notification.",
    educationRequirement: "Bachelor's degree in any discipline.",
    applicationProcess: "Online through the SBI careers portal during the announced window.",
    officialWebsite: "https://sbi.co.in/careers",
    preparationMonths: 9,
    difficulty: "VERY_HIGH",
    competitionNote: "Among the most competitive banking exams, with a reputation for a harder Main paper than IBPS.",
    stages: [
      {
        name: "Preliminary Examination",
        pattern: [
          { paper: "English Language", marks: 30, questions: 30, durationMinutes: 20 },
          { paper: "Quantitative Aptitude", marks: 35, questions: 35, durationMinutes: 20 },
          { paper: "Reasoning Ability", marks: 35, questions: 35, durationMinutes: 20 },
        ],
        durationMinutes: 60,
        marksTotal: 100,
        negativeMarking: true,
        negativeMarkingRatio: "0.25 marks per wrong answer",
        isQualifyingOnly: true,
      },
      {
        name: "Main Examination",
        pattern: [
          { paper: "Reasoning & Computer Aptitude", marks: 60, durationMinutes: 60 },
          { paper: "Data Analysis & Interpretation", marks: 60, durationMinutes: 45 },
          { paper: "General / Economy / Banking Awareness", marks: 60, durationMinutes: 40 },
          { paper: "English Language", marks: 40, durationMinutes: 40 },
          { paper: "Descriptive — letter and essay", marks: 50, durationMinutes: 30 },
        ],
        marksTotal: 250,
        negativeMarking: true,
        negativeMarkingRatio: "0.25 marks per wrong answer",
      },
      {
        name: "Psychometric Test, Group Exercise & Interview",
        pattern: [
          { paper: "Group exercise", marks: 20 },
          { paper: "Interview", marks: 30 },
          { paper: "Psychometric test", note: "Used as an input to the interview." },
        ],
        marksTotal: 50,
      },
    ],
    selection: [
      { name: "Preliminary", description: "Screening only." },
      { name: "Main", description: "Objective and descriptive; carries 75% weight in the final merit." },
      { name: "Group exercise and interview", description: "Carries 25% weight." },
    ],
    syllabus: [
      {
        subject: "Data Analysis & Interpretation",
        topics: [
          { topic: "Advanced data interpretation sets", weight: 5 },
          { topic: "Caselet and arithmetic DI", weight: 4 },
          { topic: "Data sufficiency", weight: 3 },
        ],
      },
      {
        subject: "Reasoning",
        topics: [
          { topic: "High-level puzzles and arrangements", weight: 5 },
          { topic: "Critical reasoning", weight: 4 },
          { topic: "Input-output and machine coding", weight: 3 },
        ],
      },
      {
        subject: "English Language",
        topics: [
          { topic: "Advanced reading comprehension", weight: 4 },
          { topic: "Vocabulary in context", weight: 3 },
          { topic: "Sentence rearrangement and connectors", weight: 3 },
          { topic: "Descriptive writing", weight: 3 },
        ],
      },
      {
        subject: "Banking & Economy",
        topics: [
          { topic: "Banking and financial awareness", weight: 4 },
          { topic: "Economic current affairs", weight: 4 },
        ],
      },
      {
        subject: "Interview & Group Exercise",
        topics: [
          { topic: "Group discussion practice", weight: 3 },
          { topic: "Interview preparation — banking domain and personal profile", weight: 3 },
        ],
      },
    ],
    pay: [{ postName: "Probationary Officer", grossMin: 55_000, grossMax: 70_000, note: "Approximate gross including allowances; varies by city. Confirm with SBI." }],
    resources: [
      { kind: "official", title: "SBI careers portal", url: "https://sbi.co.in/careers", budgetTier: "free" },
      { kind: "practice", title: "SBI PO previous year papers", budgetTier: "free" },
      { kind: "free_resource", title: "Daily editorial reading", budgetTier: "free", note: "SBI's English paper rewards genuine reading habit over rote vocabulary." },
    ],
  },
  {
    slug: "rrb-ntpc",
    name: "RRB Non-Technical Popular Categories Examination",
    shortName: "RRB NTPC",
    organisation: {
      shortName: "RRB",
      name: "Railway Recruitment Boards",
      type: "central",
      website: "https://indianrailways.gov.in",
    },
    category: "railways",
    sourceKey: "rrb",
    description:
      "Recruitment for non-technical posts in Indian Railways — Station Master, Goods Guard, Clerk, Commercial Apprentice and similar. Separate vacancy pools for Class 12 level and graduate level posts.",
    eligibility: [
      { label: "Education", detail: "Class 12 pass for undergraduate-level posts; a bachelor's degree for graduate-level posts." },
      { label: "Medical standards", detail: "Vision and fitness standards apply and differ by post, particularly for safety-critical roles." },
    ],
    ageLimit: {
      min: 18,
      max: 33,
      relaxations: [
        { group: "OBC", years: 3 },
        { group: "SC/ST", years: 5 },
        { group: "PwD", years: 10 },
      ],
      note: "Varies by post level. Confirm in the current notification.",
    },
    nationality: "Indian citizen, or as specified in the notification.",
    educationRequirement: "Class 12 pass or bachelor's degree, depending on the post.",
    applicationProcess: "Online through the relevant Railway Recruitment Board's regional website.",
    officialWebsite: "https://indianrailways.gov.in",
    preparationMonths: 8,
    difficulty: "MEDIUM",
    competitionNote:
      "Applicant volumes are enormous — often over a crore of applications — but so are vacancy numbers relative to other government exams.",
    stages: [
      {
        name: "CBT 1 — First Stage Computer Based Test",
        pattern: [
          { paper: "Mathematics", marks: 30, questions: 30 },
          { paper: "General Intelligence and Reasoning", marks: 30, questions: 30 },
          { paper: "General Awareness", marks: 40, questions: 40 },
        ],
        durationMinutes: 90,
        marksTotal: 100,
        negativeMarking: true,
        negativeMarkingRatio: "One third of a mark per wrong answer",
        isQualifyingOnly: true,
      },
      {
        name: "CBT 2 — Second Stage Computer Based Test",
        pattern: [
          { paper: "Mathematics", marks: 35, questions: 35 },
          { paper: "General Intelligence and Reasoning", marks: 35, questions: 35 },
          { paper: "General Awareness", marks: 50, questions: 50 },
        ],
        durationMinutes: 90,
        marksTotal: 120,
        negativeMarking: true,
        negativeMarkingRatio: "One third of a mark per wrong answer",
      },
      {
        name: "Skill Test",
        pattern: [
          { paper: "Typing Skill Test", note: "For Junior Clerk and similar posts." },
          { paper: "Computer Based Aptitude Test", note: "For Station Master and Traffic Assistant posts." },
        ],
        isQualifyingOnly: true,
      },
    ],
    selection: [
      { name: "CBT 1", description: "Screening stage." },
      { name: "CBT 2", description: "Determines merit for most posts." },
      { name: "Skill or aptitude test", description: "Post-specific and qualifying." },
      { name: "Document verification and medical examination", description: "Medical standards are a genuine filter for safety-critical posts." },
    ],
    syllabus: [
      {
        subject: "Mathematics",
        topics: [
          { topic: "Number system, BODMAS, decimals and fractions", weight: 3 },
          { topic: "Percentage, ratio and proportion", weight: 3 },
          { topic: "Time and work, time and distance", weight: 3 },
          { topic: "Profit and loss, simple and compound interest", weight: 3 },
          { topic: "Mensuration and geometry", weight: 3 },
          { topic: "Elementary statistics", weight: 2 },
        ],
      },
      {
        subject: "General Intelligence & Reasoning",
        topics: [
          { topic: "Analogies, series and coding-decoding", weight: 3 },
          { topic: "Syllogism and Venn diagrams", weight: 3 },
          { topic: "Puzzles and data interpretation", weight: 3 },
          { topic: "Statement and conclusion", weight: 2 },
        ],
      },
      {
        subject: "General Awareness",
        topics: [
          { topic: "Current events of national and international importance", weight: 4 },
          { topic: "Indian history, freedom struggle, culture", weight: 3 },
          { topic: "Indian geography and economy", weight: 3 },
          { topic: "Indian polity and governance", weight: 3 },
          { topic: "General science up to Class 10", weight: 3 },
          { topic: "Railways — history and general knowledge", weight: 2 },
        ],
      },
    ],
    pay: [
      { postName: "Station Master", payLevel: "Level 6", grossMin: 35_400, grossMax: 1_12_400 },
      { postName: "Goods Guard", payLevel: "Level 5", grossMin: 29_200, grossMax: 92_300 },
      { postName: "Junior Clerk cum Typist", payLevel: "Level 2", grossMin: 19_900, grossMax: 63_200 },
    ],
    resources: [
      { kind: "official", title: "RRB regional websites", url: "https://indianrailways.gov.in", budgetTier: "free", note: "Notifications are issued regionally — watch the board for your zone." },
      { kind: "practice", title: "RRB previous year papers", budgetTier: "free" },
      { kind: "book", title: "Lucent's General Knowledge", budgetTier: "low", costNote: "Check current price.", note: "Widely used for the general awareness section." },
    ],
  },
  {
    slug: "rrb-group-d",
    name: "RRB Group D Examination",
    shortName: "RRB Group D",
    organisation: { shortName: "RRB", name: "Railway Recruitment Boards", type: "central", website: "https://indianrailways.gov.in" },
    category: "railways",
    sourceKey: "rrb",
    description:
      "Recruitment for Level 1 posts in Indian Railways — track maintainer, helper, assistant and porter roles. Open to Class 10 pass candidates, making it one of the most accessible government jobs in the country.",
    eligibility: [
      { label: "Education", detail: "Class 10 pass, or an ITI certificate, or a National Apprenticeship Certificate." },
      { label: "Physical efficiency", detail: "A physical efficiency test with separate standards for male and female candidates." },
      { label: "Medical standards", detail: "Vision and fitness standards apply." },
    ],
    ageLimit: { min: 18, max: 33, relaxations: [{ group: "OBC", years: 3 }, { group: "SC/ST", years: 5 }] },
    nationality: "Indian citizen, or as specified in the notification.",
    educationRequirement: "Class 10 pass or ITI certificate.",
    applicationProcess: "Online through the relevant RRB regional website.",
    officialWebsite: "https://indianrailways.gov.in",
    preparationMonths: 6,
    difficulty: "MEDIUM",
    competitionNote: "Extremely high application volumes, but very large vacancy numbers. A realistic route into government service on a Class 10 qualification.",
    stages: [
      {
        name: "Computer Based Test",
        pattern: [
          { paper: "General Science", marks: 25, questions: 25 },
          { paper: "Mathematics", marks: 25, questions: 25 },
          { paper: "General Intelligence and Reasoning", marks: 30, questions: 30 },
          { paper: "General Awareness and Current Affairs", marks: 20, questions: 20 },
        ],
        durationMinutes: 90,
        marksTotal: 100,
        negativeMarking: true,
        negativeMarkingRatio: "One third of a mark per wrong answer",
      },
      {
        name: "Physical Efficiency Test",
        pattern: [{ paper: "Running and weight-carrying standards", note: "Separate standards for male and female candidates. Qualifying only." }],
        isQualifyingOnly: true,
      },
    ],
    selection: [
      { name: "Computer Based Test", description: "Determines who proceeds to the physical test." },
      { name: "Physical Efficiency Test", description: "Qualifying. Train for this in parallel with the written preparation — people do fail here." },
      { name: "Document verification and medical", description: "Final stage before appointment." },
    ],
    syllabus: [
      {
        subject: "General Science",
        topics: [
          { topic: "Physics up to Class 10", weight: 3 },
          { topic: "Chemistry up to Class 10", weight: 3 },
          { topic: "Life sciences up to Class 10", weight: 3 },
        ],
      },
      {
        subject: "Mathematics",
        topics: [
          { topic: "Number system and BODMAS", weight: 3 },
          { topic: "Percentage, ratio, average", weight: 3 },
          { topic: "Time, work, speed, distance", weight: 3 },
          { topic: "Mensuration and geometry basics", weight: 2 },
        ],
      },
      {
        subject: "Reasoning",
        topics: [
          { topic: "Analogies and classification", weight: 3 },
          { topic: "Series and coding-decoding", weight: 3 },
          { topic: "Directions and blood relations", weight: 2 },
        ],
      },
      {
        subject: "General Awareness",
        topics: [
          { topic: "Current affairs", weight: 3 },
          { topic: "Indian history, geography, polity basics", weight: 3 },
        ],
      },
      { subject: "Physical Preparation", topics: [{ topic: "Running and endurance training", weight: 4 }] },
    ],
    pay: [{ postName: "Level 1 posts", payLevel: "Level 1", grossMin: 18_000, grossMax: 56_900 }],
    resources: [
      { kind: "official", title: "RRB regional websites", url: "https://indianrailways.gov.in", budgetTier: "free" },
      { kind: "book", title: "Lucent's General Knowledge", budgetTier: "low", costNote: "Check current price." },
      { kind: "free_resource", title: "NCERT Science, Class 9 and 10", url: "https://ncert.nic.in/textbook.php", budgetTier: "free", note: "Free PDFs. The science section is drawn from this level." },
    ],
  },
  {
    slug: "neet-ug",
    name: "National Eligibility cum Entrance Test (Undergraduate)",
    shortName: "NEET UG",
    organisation: {
      shortName: "NTA",
      name: "National Testing Agency",
      type: "central",
      website: "https://nta.ac.in",
    },
    category: "medical-entrance",
    sourceKey: "nta",
    description:
      "The single entrance examination for admission to MBBS, BDS, BAMS, BHMS, BSc Nursing and other medical and allied courses across India. A pen-and-paper test covering Physics, Chemistry and Biology at Class 11 and 12 level.",
    eligibility: [
      { label: "Education", detail: "Class 12 with Physics, Chemistry, Biology or Biotechnology, and English. Minimum aggregate marks in these subjects apply and differ by category." },
      { label: "Minimum age", detail: "17 years as on a date specified in the information bulletin." },
      { label: "Attempts", detail: "No attempt limit at present. Confirm in the current information bulletin." },
    ],
    ageLimit: { min: 17, note: "No upper age limit at present. Confirm in the current NTA information bulletin, as this has changed before." },
    nationality: "Indian nationals, NRIs, OCIs, PIOs and foreign nationals may appear, subject to conditions in the bulletin.",
    educationRequirement: "Class 12 with Physics, Chemistry and Biology or Biotechnology.",
    applicationProcess:
      "Online through the NTA NEET portal. Requires a photograph, signature and category certificates in the specified format.",
    officialWebsite: "https://neet.nta.nic.in",
    preparationMonths: 24,
    difficulty: "VERY_HIGH",
    competitionNote:
      "Over twenty lakh candidates compete for roughly one lakh MBBS seats, of which government seats are a fraction. The competition for affordable seats is far tighter than the headline ratio suggests.",
    stages: [
      {
        name: "Single Examination",
        pattern: [
          { paper: "Physics", marks: 180, questions: 45 },
          { paper: "Chemistry", marks: 180, questions: 45 },
          { paper: "Biology (Botany + Zoology)", marks: 360, questions: 90 },
        ],
        durationMinutes: 200,
        marksTotal: 720,
        negativeMarking: true,
        negativeMarkingRatio: "1 mark deducted per wrong answer; 4 awarded per correct answer",
      },
    ],
    selection: [
      { name: "NEET score and All India Rank", description: "A single score determines rank across all participating institutions." },
      { name: "Counselling", description: "Conducted through the All India Quota (MCC) and state quotas separately. Registering for both is usually advisable." },
      { name: "Seat allotment", description: "Based on rank, category, quota and the choices you fill. Choice-filling strategy materially affects outcomes." },
    ],
    syllabus: [
      {
        subject: "Physics",
        topics: [
          { topic: "Mechanics — kinematics, laws of motion, work and energy", weight: 5 },
          { topic: "Thermodynamics and kinetic theory", weight: 3 },
          { topic: "Oscillations and waves", weight: 3 },
          { topic: "Electrostatics and current electricity", weight: 5 },
          { topic: "Magnetism and electromagnetic induction", weight: 4 },
          { topic: "Optics", weight: 4 },
          { topic: "Modern physics — dual nature, atoms, nuclei", weight: 4 },
        ],
      },
      {
        subject: "Chemistry",
        topics: [
          { topic: "Physical chemistry — mole concept, thermodynamics, equilibrium", weight: 5 },
          { topic: "Chemical kinetics and electrochemistry", weight: 4 },
          { topic: "Inorganic chemistry — periodic table, chemical bonding", weight: 4 },
          { topic: "p-block, d-block and coordination compounds", weight: 4 },
          { topic: "Organic chemistry — GOC, hydrocarbons", weight: 5 },
          { topic: "Organic functional groups and biomolecules", weight: 5 },
        ],
      },
      {
        subject: "Biology — Botany",
        topics: [
          { topic: "Diversity in the living world and plant kingdom", weight: 3 },
          { topic: "Cell structure and function", weight: 4 },
          { topic: "Plant physiology", weight: 4 },
          { topic: "Genetics and evolution", weight: 5 },
          { topic: "Ecology and environment", weight: 5 },
        ],
      },
      {
        subject: "Biology — Zoology",
        topics: [
          { topic: "Animal kingdom and structural organisation", weight: 3 },
          { topic: "Human physiology", weight: 5 },
          { topic: "Reproduction", weight: 4 },
          { topic: "Human health and disease", weight: 4 },
          { topic: "Biotechnology and its applications", weight: 3 },
        ],
      },
    ],
    resources: [
      { kind: "official", title: "NTA NEET information bulletin", url: "https://neet.nta.nic.in", budgetTier: "free", note: "The only authoritative source for eligibility, dates and the syllabus." },
      { kind: "free_resource", title: "NCERT Physics, Chemistry and Biology, Class 11 and 12", url: "https://ncert.nic.in/textbook.php", budgetTier: "free", note: "Free PDFs. The Biology section in particular is drawn very heavily from NCERT — many toppers report reading it repeatedly rather than widely." },
      { kind: "practice", title: "NEET previous year papers", budgetTier: "free", note: "Twenty years of papers are freely available. Working through them is the highest-return activity in NEET preparation." },
      { kind: "book", title: "Concepts of Physics", author: "H.C. Verma", budgetTier: "low", costNote: "Check current price." },
      { kind: "book", title: "Organic Chemistry", author: "Morrison and Boyd", budgetTier: "low", costNote: "Check current price.", note: "Beyond NEET requirement for most students — use selectively." },
      { kind: "coaching", title: "Coaching programmes", budgetTier: "standard", costNote: "Two-year classroom programmes commonly run to several lakh. Verify fees directly.", note: "Optional. Consider the cost against a government-college seat's total fees before committing." },
    ],
  },
  {
    slug: "jee-main",
    name: "Joint Entrance Examination (Main)",
    shortName: "JEE Main",
    organisation: { shortName: "NTA", name: "National Testing Agency", type: "central", website: "https://nta.ac.in" },
    category: "engineering-entrance",
    sourceKey: "nta",
    description:
      "The national entrance examination for admission to NITs, IIITs and centrally funded technical institutions, and the qualifying stage for JEE Advanced. Conducted in multiple sessions per year.",
    eligibility: [
      { label: "Education", detail: "Class 12 with Physics and Mathematics as compulsory subjects, plus Chemistry, Biology, Biotechnology or a technical vocational subject." },
      { label: "Attempts", detail: "Candidates may appear in the year of Class 12 and the two following years. Confirm in the current bulletin." },
    ],
    ageLimit: { note: "No age limit for appearing in JEE Main, though individual institutions may set their own criteria. Confirm in the current bulletin." },
    nationality: "Indian nationals and specified other categories, as detailed in the information bulletin.",
    educationRequirement: "Class 12 with Physics and Mathematics.",
    applicationProcess: "Online through the JEE Main portal for each session separately.",
    officialWebsite: "https://jeemain.nta.nic.in",
    preparationMonths: 24,
    difficulty: "VERY_HIGH",
    competitionNote:
      "Over ten lakh candidates per session. The top approximately 2.5 lakh qualify for JEE Advanced; NIT admission depends on percentile, category and home state quota.",
    stages: [
      {
        name: "Paper 1 — B.E./B.Tech",
        pattern: [
          { paper: "Physics", marks: 100, questions: 25 },
          { paper: "Chemistry", marks: 100, questions: 25 },
          { paper: "Mathematics", marks: 100, questions: 25 },
        ],
        durationMinutes: 180,
        marksTotal: 300,
        negativeMarking: true,
        negativeMarkingRatio: "1 mark deducted per wrong answer in MCQs; 4 awarded per correct answer",
      },
      {
        name: "Paper 2 — B.Arch / B.Planning",
        pattern: [
          { paper: "Mathematics", note: "Common section." },
          { paper: "Aptitude Test", note: "Common section." },
          { paper: "Drawing Test (B.Arch) or Planning Test (B.Planning)" },
        ],
        durationMinutes: 180,
      },
    ],
    selection: [
      { name: "Percentile score", description: "Normalised across sessions; the best of a candidate's sessions is considered." },
      { name: "JoSAA counselling", description: "Centralised counselling for NITs, IIITs and GFTIs based on rank, category and quota." },
      { name: "JEE Advanced qualification", description: "Top qualifying candidates become eligible for JEE Advanced and thus for the IITs." },
    ],
    syllabus: [
      {
        subject: "Mathematics",
        topics: [
          { topic: "Sets, relations, functions", weight: 3 },
          { topic: "Complex numbers and quadratic equations", weight: 3 },
          { topic: "Matrices and determinants", weight: 3 },
          { topic: "Permutations, combinations, binomial theorem", weight: 3 },
          { topic: "Sequences and series", weight: 3 },
          { topic: "Limits, continuity and differentiability", weight: 4 },
          { topic: "Integral calculus and differential equations", weight: 5 },
          { topic: "Coordinate geometry", weight: 4 },
          { topic: "Three-dimensional geometry and vectors", weight: 4 },
          { topic: "Probability and statistics", weight: 3 },
        ],
      },
      {
        subject: "Physics",
        topics: [
          { topic: "Kinematics and laws of motion", weight: 4 },
          { topic: "Work, energy, power, rotational motion", weight: 4 },
          { topic: "Gravitation and properties of matter", weight: 3 },
          { topic: "Thermodynamics and kinetic theory", weight: 3 },
          { topic: "Oscillations and waves", weight: 3 },
          { topic: "Electrostatics and current electricity", weight: 5 },
          { topic: "Magnetics and electromagnetic induction", weight: 4 },
          { topic: "Optics and modern physics", weight: 4 },
        ],
      },
      {
        subject: "Chemistry",
        topics: [
          { topic: "Some basic concepts, atomic structure, bonding", weight: 4 },
          { topic: "Thermodynamics and equilibrium", weight: 4 },
          { topic: "Electrochemistry and chemical kinetics", weight: 4 },
          { topic: "Periodic table and p-block elements", weight: 4 },
          { topic: "d- and f-block, coordination compounds", weight: 3 },
          { topic: "Organic chemistry basics and hydrocarbons", weight: 4 },
          { topic: "Organic functional groups and biomolecules", weight: 4 },
        ],
      },
    ],
    resources: [
      { kind: "official", title: "JEE Main information bulletin", url: "https://jeemain.nta.nic.in", budgetTier: "free" },
      { kind: "free_resource", title: "NCERT Class 11 and 12 textbooks", url: "https://ncert.nic.in/textbook.php", budgetTier: "free", note: "Especially critical for Chemistry." },
      { kind: "practice", title: "JEE previous year papers", budgetTier: "free" },
      { kind: "book", title: "Concepts of Physics, Volumes 1 and 2", author: "H.C. Verma", budgetTier: "low", costNote: "Check current price." },
      { kind: "book", title: "Problems in General Physics", author: "I.E. Irodov", budgetTier: "low", costNote: "Check current price.", note: "Advanced — appropriate for JEE Advanced rather than Main." },
    ],
  },
  {
    slug: "gate",
    name: "Graduate Aptitude Test in Engineering",
    shortName: "GATE",
    organisation: {
      shortName: "IISc-IIT",
      name: "Indian Institute of Science and the IITs (rotating organising institute)",
      type: "central",
      website: "https://gate.iitkgp.ac.in",
    },
    category: "psu-entrance",
    sourceKey: "aicte",
    description:
      "A national examination testing comprehensive understanding of undergraduate engineering and science subjects. Used both for postgraduate admission and for recruitment by many public sector undertakings — which is why it matters even to students with no interest in an MTech.",
    eligibility: [
      { label: "Education", detail: "Candidates in the third year or later of a bachelor's programme in engineering, technology, architecture or science, or who have already completed one." },
      { label: "Score validity", detail: "The GATE score is valid for three years from the date of announcement." },
    ],
    ageLimit: { note: "No age limit for GATE itself. PSUs recruiting through GATE apply their own age criteria." },
    nationality: "Open to Indian nationals and candidates from certain other countries, as specified.",
    educationRequirement: "Bachelor's degree in engineering, technology, architecture or science, or third year and above.",
    applicationProcess: "Online through the GATE Online Application Processing System, hosted by the organising institute each year.",
    officialWebsite: "https://gate.iitkgp.ac.in",
    preparationMonths: 10,
    difficulty: "HIGH",
    competitionNote:
      "Around eight to ten lakh candidates annually. PSU recruitment through GATE is far more competitive than postgraduate admission.",
    stages: [
      {
        name: "Computer Based Test",
        pattern: [
          { paper: "General Aptitude", marks: 15, questions: 10 },
          { paper: "Engineering Mathematics", marks: 13, note: "Included within the subject paper for most disciplines." },
          { paper: "Core subject paper", marks: 72, note: "One of 30 discipline-specific papers." },
        ],
        durationMinutes: 180,
        marksTotal: 100,
        negativeMarking: true,
        negativeMarkingRatio: "One third for 1-mark MCQs and two thirds for 2-mark MCQs; no negative marking for numerical answer type questions",
      },
    ],
    selection: [
      { name: "GATE score", description: "Normalised score valid for three years." },
      { name: "PSU recruitment", description: "Participating PSUs shortlist on GATE score, then conduct their own interview or group discussion." },
      { name: "Postgraduate admission", description: "IITs, NITs and IISc admit to MTech and MS programmes on GATE score, usually with an interview." },
    ],
    syllabus: [
      {
        subject: "General Aptitude",
        topics: [
          { topic: "Verbal ability", weight: 2 },
          { topic: "Numerical ability and data interpretation", weight: 3 },
        ],
      },
      {
        subject: "Engineering Mathematics",
        topics: [
          { topic: "Linear algebra", weight: 3 },
          { topic: "Calculus", weight: 3 },
          { topic: "Differential equations", weight: 3 },
          { topic: "Probability and statistics", weight: 3 },
          { topic: "Numerical methods", weight: 2 },
        ],
      },
      {
        subject: "Core Discipline",
        topics: [
          { topic: "Core subject fundamentals — discipline specific", weight: 5 },
          { topic: "Applied and design topics", weight: 5 },
          { topic: "Previous year question practice by topic", weight: 5 },
        ],
      },
    ],
    resources: [
      { kind: "official", title: "GATE official website and syllabus", url: "https://gate.iitkgp.ac.in", budgetTier: "free", note: "The organising institute changes yearly; always check the current year's site." },
      { kind: "practice", title: "GATE previous year papers, by topic", budgetTier: "free", note: "GATE rewards topic-wise past-paper practice more than almost any other exam." },
      { kind: "free_resource", title: "NPTEL video lectures", url: "https://nptel.ac.in", budgetTier: "free", note: "Free, high-quality lectures from IIT faculty across every GATE discipline." },
    ],
  },
  {
    slug: "ssc-je",
    name: "SSC Junior Engineer Examination",
    shortName: "SSC JE",
    organisation: { shortName: "SSC", name: "Staff Selection Commission", type: "central", website: "https://ssc.gov.in" },
    category: "ssc",
    sourceKey: "ssc",
    description:
      "Recruitment of Junior Engineers in Civil, Mechanical, Electrical and Quantity Surveying disciplines for central government departments including CPWD, MES and CWC.",
    eligibility: [
      { label: "Education", detail: "A diploma or degree in the relevant engineering discipline. Requirements differ by department — check the post-wise table." },
      { label: "Experience", detail: "Some departments require two years of relevant experience for diploma holders." },
    ],
    ageLimit: { min: 18, max: 32, relaxations: [{ group: "OBC", years: 3 }, { group: "SC/ST", years: 5 }], note: "Varies by department — commonly 30 or 32." },
    nationality: "Indian citizen, or as specified.",
    educationRequirement: "Diploma or degree in Civil, Mechanical or Electrical Engineering.",
    applicationProcess: "Online through the SSC portal.",
    officialWebsite: "https://ssc.gov.in",
    preparationMonths: 8,
    difficulty: "HIGH",
    competitionNote: "Strong option for diploma holders — a route to a central government engineering post without a degree.",
    stages: [
      {
        name: "Paper I — Objective",
        pattern: [
          { paper: "General Intelligence and Reasoning", marks: 50, questions: 50 },
          { paper: "General Awareness", marks: 50, questions: 50 },
          { paper: "General Engineering (discipline specific)", marks: 100, questions: 100 },
        ],
        durationMinutes: 120,
        marksTotal: 200,
        negativeMarking: true,
        negativeMarkingRatio: "0.25 marks per wrong answer",
      },
      {
        name: "Paper II — Descriptive",
        pattern: [{ paper: "General Engineering — discipline specific", marks: 300, durationMinutes: 120 }],
        marksTotal: 300,
        negativeMarking: false,
      },
    ],
    selection: [
      { name: "Paper I", description: "Objective screening." },
      { name: "Paper II", description: "Descriptive engineering paper; the decisive stage." },
      { name: "Document verification", description: "Verification of qualification and experience." },
    ],
    syllabus: [
      {
        subject: "General Engineering — Civil",
        topics: [
          { topic: "Building materials and construction", weight: 4 },
          { topic: "Surveying", weight: 3 },
          { topic: "Soil mechanics", weight: 3 },
          { topic: "Hydraulics and irrigation", weight: 4 },
          { topic: "Structural analysis and RCC design", weight: 5 },
          { topic: "Estimating and costing", weight: 4 },
        ],
      },
      {
        subject: "General Engineering — Electrical",
        topics: [
          { topic: "Basic concepts and circuit laws", weight: 4 },
          { topic: "AC fundamentals and measurement", weight: 4 },
          { topic: "Electrical machines", weight: 5 },
          { topic: "Transmission and distribution", weight: 4 },
          { topic: "Utilisation and estimation", weight: 3 },
        ],
      },
      {
        subject: "General Engineering — Mechanical",
        topics: [
          { topic: "Thermodynamics", weight: 5 },
          { topic: "Fluid mechanics and hydraulic machines", weight: 4 },
          { topic: "Theory of machines and machine design", weight: 4 },
          { topic: "Production engineering", weight: 3 },
        ],
      },
      {
        subject: "Reasoning & General Awareness",
        topics: [
          { topic: "Reasoning — analogies, series, coding", weight: 3 },
          { topic: "Current affairs and general science", weight: 3 },
        ],
      },
    ],
    pay: [{ postName: "Junior Engineer", payLevel: "Level 6", grossMin: 35_400, grossMax: 1_12_400 }],
    resources: [
      { kind: "official", title: "SSC JE notification and syllabus", url: "https://ssc.gov.in", budgetTier: "free" },
      { kind: "practice", title: "SSC JE previous year papers", budgetTier: "free" },
      { kind: "free_resource", title: "NPTEL engineering lectures", url: "https://nptel.ac.in", budgetTier: "free" },
    ],
  },
  {
    slug: "nda",
    name: "National Defence Academy Examination",
    shortName: "NDA",
    organisation: {
      shortName: "UPSC",
      name: "Union Public Service Commission",
      type: "central",
      website: "https://upsc.gov.in",
    },
    category: "defence",
    sourceKey: "upsc-defence",
    description:
      "Entry to the National Defence Academy and Naval Academy for candidates after Class 12, leading to a commission in the Army, Navy or Air Force. Conducted twice a year.",
    eligibility: [
      { label: "Education", detail: "Class 12 pass for the Army wing; Class 12 with Physics, Chemistry and Mathematics for the Air Force, Navy and Naval Academy." },
      { label: "Marital status", detail: "Candidates must be unmarried." },
      { label: "Physical and medical standards", detail: "Detailed standards apply and are a substantial filter. Review them before applying." },
    ],
    ageLimit: { min: 16, max: 19, note: "Approximately 16.5 to 19.5 years, reckoned against dates specified in each notification. Confirm exact dates with UPSC." },
    nationality: "Indian citizen, or as otherwise specified in the notification.",
    educationRequirement: "Class 12 pass; PCM required for Air Force, Navy and Naval Academy.",
    applicationProcess: "Online through the UPSC online application portal.",
    officialWebsite: "https://upsc.gov.in",
    preparationMonths: 10,
    difficulty: "VERY_HIGH",
    competitionNote:
      "The written examination filters heavily, but the SSB interview is where most remaining candidates are eliminated. Medical standards remove more.",
    stages: [
      {
        name: "Written Examination",
        pattern: [
          { paper: "Mathematics", marks: 300, questions: 120, durationMinutes: 150 },
          { paper: "General Ability Test", marks: 600, questions: 150, durationMinutes: 150, note: "English and General Knowledge." },
        ],
        marksTotal: 900,
        negativeMarking: true,
        negativeMarkingRatio: "One third of the marks assigned per wrong answer",
      },
      {
        name: "SSB Interview",
        pattern: [
          { paper: "Stage I — Officer Intelligence Rating and Picture Perception", note: "Screening; a large share of candidates are eliminated here." },
          { paper: "Stage II — Psychological tests, group tasks, personal interview", marks: 900, note: "Conducted over four to five days." },
        ],
        marksTotal: 900,
      },
    ],
    selection: [
      { name: "Written examination", description: "Mathematics and General Ability." },
      { name: "SSB interview", description: "A five-day assessment of officer-like qualities. Equal weight to the written exam." },
      { name: "Medical examination", description: "Stringent standards; a common point of rejection." },
      { name: "Merit list", description: "Combined written and SSB marks." },
    ],
    syllabus: [
      {
        subject: "Mathematics",
        topics: [
          { topic: "Algebra and matrices", weight: 4 },
          { topic: "Trigonometry", weight: 4 },
          { topic: "Analytical geometry — 2D and 3D", weight: 4 },
          { topic: "Differential and integral calculus", weight: 5 },
          { topic: "Vector algebra", weight: 3 },
          { topic: "Statistics and probability", weight: 3 },
        ],
      },
      {
        subject: "English",
        topics: [
          { topic: "Grammar and usage", weight: 4 },
          { topic: "Vocabulary", weight: 3 },
          { topic: "Comprehension and cohesion", weight: 3 },
        ],
      },
      {
        subject: "General Knowledge",
        topics: [
          { topic: "Physics", weight: 4 },
          { topic: "Chemistry", weight: 3 },
          { topic: "General Science", weight: 3 },
          { topic: "History and freedom movement", weight: 3 },
          { topic: "Geography", weight: 3 },
          { topic: "Current events", weight: 4 },
        ],
      },
      {
        subject: "SSB Preparation",
        topics: [
          { topic: "Psychological test practice — TAT, WAT, SRT", weight: 5 },
          { topic: "Group task and discussion practice", weight: 4 },
          { topic: "Physical fitness preparation", weight: 4 },
        ],
      },
    ],
    resources: [
      { kind: "official", title: "UPSC NDA notification", url: "https://upsc.gov.in", budgetTier: "free" },
      { kind: "free_resource", title: "NCERT Mathematics and Science, Class 11 and 12", url: "https://ncert.nic.in/textbook.php", budgetTier: "free" },
      { kind: "book", title: "Pathfinder for NDA & NA Entrance Examination", publisher: "Arihant", budgetTier: "low", costNote: "Check current price." },
      { kind: "practice", title: "NDA previous year papers", budgetTier: "free" },
    ],
  },
  {
    slug: "cds",
    name: "Combined Defence Services Examination",
    shortName: "CDS",
    organisation: { shortName: "UPSC", name: "Union Public Service Commission", type: "central", website: "https://upsc.gov.in" },
    category: "defence",
    sourceKey: "upsc-defence",
    description:
      "Recruitment of graduates as commissioned officers into the Indian Military Academy, Naval Academy, Air Force Academy and Officers Training Academy. Conducted twice a year.",
    eligibility: [
      { label: "Education", detail: "A bachelor's degree for IMA and OTA; a degree with Physics and Mathematics at Class 12 for the Naval Academy; a degree or BE/BTech for the Air Force Academy." },
      { label: "Marital status", detail: "Unmarried for IMA, INA and AFA. OTA admits married candidates in certain entries." },
      { label: "Physical and medical standards", detail: "Detailed standards apply." },
    ],
    ageLimit: { min: 19, max: 25, note: "Varies by academy — IMA approximately 19–24, OTA approximately 19–25. Confirm in the notification." },
    nationality: "Indian citizen, or as specified.",
    educationRequirement: "Bachelor's degree; specific subject requirements for technical entries.",
    applicationProcess: "Online through the UPSC portal.",
    officialWebsite: "https://upsc.gov.in",
    preparationMonths: 6,
    difficulty: "HIGH",
    competitionNote: "Less competitive than NDA at the written stage, but the SSB remains the decisive filter.",
    stages: [
      {
        name: "Written Examination",
        pattern: [
          { paper: "English", marks: 100, durationMinutes: 120 },
          { paper: "General Knowledge", marks: 100, durationMinutes: 120 },
          { paper: "Elementary Mathematics", marks: 100, durationMinutes: 120, note: "Not required for the OTA entry." },
        ],
        marksTotal: 300,
        negativeMarking: true,
        negativeMarkingRatio: "One third of the marks assigned per wrong answer",
      },
      {
        name: "SSB Interview",
        pattern: [{ paper: "Five-day SSB assessment", marks: 300 }],
        marksTotal: 300,
      },
    ],
    selection: [
      { name: "Written examination", description: "English, General Knowledge and Elementary Mathematics." },
      { name: "SSB interview", description: "Five-day assessment of officer potential." },
      { name: "Medical examination", description: "Stringent fitness standards." },
    ],
    syllabus: [
      {
        subject: "English",
        topics: [
          { topic: "Grammar and error spotting", weight: 4 },
          { topic: "Vocabulary and synonyms", weight: 3 },
          { topic: "Comprehension and ordering", weight: 4 },
        ],
      },
      {
        subject: "General Knowledge",
        topics: [
          { topic: "Current affairs", weight: 4 },
          { topic: "History and polity", weight: 3 },
          { topic: "Geography and economy", weight: 3 },
          { topic: "General science", weight: 3 },
          { topic: "Defence-related awareness", weight: 3 },
        ],
      },
      {
        subject: "Elementary Mathematics",
        topics: [
          { topic: "Arithmetic and number system", weight: 4 },
          { topic: "Algebra", weight: 3 },
          { topic: "Trigonometry", weight: 3 },
          { topic: "Geometry and mensuration", weight: 4 },
          { topic: "Statistics", weight: 2 },
        ],
      },
      { subject: "SSB Preparation", topics: [{ topic: "Psychological and group task practice", weight: 5 }] },
    ],
    resources: [
      { kind: "official", title: "UPSC CDS notification", url: "https://upsc.gov.in", budgetTier: "free" },
      { kind: "book", title: "Pathfinder CDS Entrance Examination", publisher: "Arihant", budgetTier: "low", costNote: "Check current price." },
      { kind: "practice", title: "CDS previous year papers", budgetTier: "free" },
    ],
  },
  {
    slug: "ctet",
    name: "Central Teacher Eligibility Test",
    shortName: "CTET",
    organisation: {
      shortName: "CBSE",
      name: "Central Board of Secondary Education",
      type: "central",
      website: "https://ctet.nic.in",
    },
    category: "teaching",
    sourceKey: "editorial",
    description:
      "A qualifying examination establishing eligibility to teach in central government schools and many state and private schools. Paper I covers Classes 1–5; Paper II covers Classes 6–8.",
    eligibility: [
      { label: "Paper I (Classes 1–5)", detail: "Senior secondary with at least 50% plus a two-year Diploma in Elementary Education, or equivalent as specified." },
      { label: "Paper II (Classes 6–8)", detail: "A bachelor's degree plus B.Ed, or equivalent as specified in the notification." },
      { label: "Validity", detail: "The CTET certificate is valid for life. Confirm current policy with CBSE." },
    ],
    ageLimit: { min: 18, note: "No upper age limit for CTET itself. Recruiting bodies apply their own age criteria." },
    nationality: "Indian citizen.",
    educationRequirement: "D.El.Ed or B.Ed as applicable to the paper.",
    applicationProcess: "Online through the CTET portal during the announced window.",
    officialWebsite: "https://ctet.nic.in",
    preparationMonths: 4,
    difficulty: "MEDIUM",
    competitionNote:
      "A qualifying test rather than a competitive one — clearing it makes you eligible, it does not itself give you a post.",
    stages: [
      {
        name: "Paper I — Classes 1 to 5",
        pattern: [
          { paper: "Child Development and Pedagogy", marks: 30, questions: 30 },
          { paper: "Language I", marks: 30, questions: 30 },
          { paper: "Language II", marks: 30, questions: 30 },
          { paper: "Mathematics", marks: 30, questions: 30 },
          { paper: "Environmental Studies", marks: 30, questions: 30 },
        ],
        durationMinutes: 150,
        marksTotal: 150,
        negativeMarking: false,
      },
      {
        name: "Paper II — Classes 6 to 8",
        pattern: [
          { paper: "Child Development and Pedagogy", marks: 30, questions: 30 },
          { paper: "Language I", marks: 30, questions: 30 },
          { paper: "Language II", marks: 30, questions: 30 },
          { paper: "Mathematics and Science, or Social Studies", marks: 60, questions: 60 },
        ],
        durationMinutes: 150,
        marksTotal: 150,
        negativeMarking: false,
      },
    ],
    selection: [
      { name: "Qualifying score", description: "60% is the general qualifying standard, with relaxation for reserved categories." },
      { name: "Certificate", description: "Establishes eligibility. Actual recruitment is conducted separately by schools and state bodies." },
    ],
    syllabus: [
      {
        subject: "Child Development & Pedagogy",
        topics: [
          { topic: "Concept of development and its relationship with learning", weight: 4 },
          { topic: "Inclusive education and children with special needs", weight: 4 },
          { topic: "Learning and pedagogy", weight: 4 },
        ],
      },
      {
        subject: "Language I & II",
        topics: [
          { topic: "Reading comprehension", weight: 3 },
          { topic: "Language pedagogy", weight: 4 },
          { topic: "Grammar and usage", weight: 3 },
        ],
      },
      {
        subject: "Mathematics",
        topics: [
          { topic: "Number system and operations", weight: 3 },
          { topic: "Geometry and measurement", weight: 3 },
          { topic: "Data handling", weight: 2 },
          { topic: "Pedagogical issues in mathematics", weight: 4 },
        ],
      },
      {
        subject: "Environmental Studies / Science / Social Studies",
        topics: [
          { topic: "Content as per NCERT curriculum", weight: 4 },
          { topic: "Pedagogical issues", weight: 4 },
        ],
      },
    ],
    resources: [
      { kind: "official", title: "CTET official information bulletin", url: "https://ctet.nic.in", budgetTier: "free" },
      { kind: "free_resource", title: "NCERT textbooks and teacher handbooks", url: "https://ncert.nic.in/textbook.php", budgetTier: "free", note: "CTET content is drawn directly from NCERT." },
      { kind: "practice", title: "CTET previous year papers", budgetTier: "free" },
    ],
  },
  {
    slug: "ugc-net",
    name: "UGC National Eligibility Test",
    shortName: "UGC NET",
    organisation: { shortName: "NTA", name: "National Testing Agency", type: "central", website: "https://ugcnet.nta.ac.in" },
    category: "teaching",
    sourceKey: "nta",
    description:
      "Determines eligibility for Assistant Professor posts and for the Junior Research Fellowship in Indian universities and colleges. Conducted twice a year across a wide range of subjects.",
    eligibility: [
      { label: "Education", detail: "A master's degree with the minimum percentage specified for your category. Candidates in their final year may appear provisionally." },
      { label: "Subject", detail: "You must appear in a subject related to your postgraduate degree." },
    ],
    ageLimit: { max: 30, note: "Upper age limit applies to the Junior Research Fellowship only, with category relaxations. There is no age limit for Assistant Professor eligibility." },
    nationality: "Indian citizen.",
    educationRequirement: "Master's degree with the minimum percentage specified.",
    applicationProcess: "Online through the NTA UGC NET portal.",
    officialWebsite: "https://ugcnet.nta.ac.in",
    preparationMonths: 6,
    difficulty: "HIGH",
    competitionNote: "Assistant Professor eligibility is achieved by a larger share of candidates; the JRF is considerably more competitive.",
    stages: [
      {
        name: "Computer Based Test",
        pattern: [
          { paper: "Paper I — Teaching and Research Aptitude", marks: 100, questions: 50 },
          { paper: "Paper II — Subject specific", marks: 200, questions: 100 },
        ],
        durationMinutes: 180,
        marksTotal: 300,
        negativeMarking: false,
      },
    ],
    selection: [
      { name: "Qualifying", description: "Separate cut-offs for Assistant Professor eligibility and for the JRF." },
      { name: "Certificate", description: "Establishes eligibility; recruitment is conducted separately by institutions." },
    ],
    syllabus: [
      {
        subject: "Paper I — Teaching & Research Aptitude",
        topics: [
          { topic: "Teaching aptitude", weight: 3 },
          { topic: "Research aptitude", weight: 3 },
          { topic: "Comprehension", weight: 2 },
          { topic: "Communication", weight: 2 },
          { topic: "Mathematical reasoning and aptitude", weight: 3 },
          { topic: "Logical reasoning", weight: 3 },
          { topic: "Data interpretation", weight: 3 },
          { topic: "Information and communication technology", weight: 2 },
          { topic: "People, development and environment", weight: 2 },
          { topic: "Higher education system", weight: 3 },
        ],
      },
      {
        subject: "Paper II — Subject",
        topics: [
          { topic: "Core subject syllabus as published by UGC", weight: 5 },
          { topic: "Previous year subject paper practice", weight: 5 },
        ],
      },
    ],
    resources: [
      { kind: "official", title: "UGC NET syllabus by subject", url: "https://ugcnet.nta.ac.in", budgetTier: "free" },
      { kind: "practice", title: "UGC NET previous year papers", budgetTier: "free" },
      { kind: "book", title: "Trueman's UGC NET General Paper I", budgetTier: "low", costNote: "Check current price." },
    ],
  },
  {
    slug: "clat",
    name: "Common Law Admission Test",
    shortName: "CLAT",
    organisation: {
      shortName: "CNLU",
      name: "Consortium of National Law Universities",
      type: "regulatory",
      website: "https://consortiumofnlus.ac.in",
    },
    category: "law-entrance",
    sourceKey: "bci",
    description:
      "The entrance examination for admission to the undergraduate and postgraduate programmes of the National Law Universities. A comprehension-heavy test rather than a knowledge test.",
    eligibility: [
      { label: "UG programme", detail: "Class 12 with the minimum percentage specified for your category. Candidates awaiting results may apply." },
      { label: "PG programme", detail: "An LLB degree with the minimum percentage specified." },
    ],
    ageLimit: { note: "No upper age limit at present. Confirm in the current notification." },
    nationality: "Indian nationals; NRI and foreign national seats are handled separately by individual universities.",
    educationRequirement: "Class 12 for the UG programme; LLB for the PG programme.",
    applicationProcess: "Online through the Consortium of NLUs portal.",
    officialWebsite: "https://consortiumofnlus.ac.in",
    preparationMonths: 12,
    difficulty: "HIGH",
    competitionNote:
      "Roughly sixty thousand candidates for approximately three thousand NLU seats. Admission to the top few NLUs is substantially more competitive than that ratio suggests.",
    stages: [
      {
        name: "Undergraduate Test",
        pattern: [
          { paper: "English Language", questions: 22, note: "Approximately 20% of the paper." },
          { paper: "Current Affairs including General Knowledge", questions: 28, note: "Approximately 25%." },
          { paper: "Legal Reasoning", questions: 28, note: "Approximately 25%." },
          { paper: "Logical Reasoning", questions: 22, note: "Approximately 20%." },
          { paper: "Quantitative Techniques", questions: 12, note: "Approximately 10%." },
        ],
        durationMinutes: 120,
        marksTotal: 120,
        negativeMarking: true,
        negativeMarkingRatio: "0.25 marks per wrong answer",
      },
    ],
    selection: [
      { name: "CLAT score and rank", description: "A single rank used across participating NLUs." },
      { name: "Centralised counselling", description: "Seat allotment by rank, category and the preference list you submit." },
    ],
    syllabus: [
      {
        subject: "English Language",
        topics: [
          { topic: "Passage-based comprehension", weight: 5 },
          { topic: "Inference and vocabulary in context", weight: 4 },
        ],
      },
      {
        subject: "Legal Reasoning",
        topics: [
          { topic: "Principle-fact application", weight: 5 },
          { topic: "Legal passages and contemporary legal issues", weight: 4 },
        ],
      },
      {
        subject: "Logical Reasoning",
        topics: [
          { topic: "Argument analysis and assumptions", weight: 4 },
          { topic: "Inference and conclusion", weight: 4 },
        ],
      },
      {
        subject: "Current Affairs & GK",
        topics: [
          { topic: "National and international current events", weight: 5 },
          { topic: "Arts, culture and historical events of significance", weight: 3 },
        ],
      },
      {
        subject: "Quantitative Techniques",
        topics: [{ topic: "Data interpretation and Class 10 level arithmetic", weight: 3 }],
      },
    ],
    resources: [
      { kind: "official", title: "CLAT Consortium official site", url: "https://consortiumofnlus.ac.in", budgetTier: "free" },
      { kind: "free_resource", title: "Daily newspaper reading", budgetTier: "free", note: "CLAT is comprehension-driven. A daily reading habit outperforms any book for this exam." },
      { kind: "practice", title: "CLAT previous year papers and Consortium sample papers", budgetTier: "free" },
    ],
  },
  {
    slug: "state-psc",
    name: "State Public Service Commission Examination",
    shortName: "State PSC",
    organisation: {
      shortName: "State PSCs",
      name: "State Public Service Commissions",
      type: "state",
      website: "https://upsc.gov.in",
    },
    category: "state-psc",
    sourceKey: "editorial",
    description:
      "Each state conducts its own civil services examination for state administrative, police and allied services. The structure broadly mirrors UPSC CSE, with substantial state-specific content and considerably better odds.",
    eligibility: [
      { label: "Education", detail: "A bachelor's degree in any discipline." },
      { label: "Domicile", detail: "Many states reserve posts or relax criteria for domiciled candidates. Check your state commission's rules." },
      { label: "Language", detail: "Several states require proficiency in the state language, sometimes as a qualifying paper." },
    ],
    ageLimit: { min: 21, max: 40, note: "Varies substantially by state — some allow up to 40 or beyond with relaxations. Check your state commission's notification." },
    nationality: "Indian citizen; domicile requirements vary by state.",
    educationRequirement: "Bachelor's degree in any discipline.",
    applicationProcess: "Online through the respective State Public Service Commission's website.",
    officialWebsite: "https://upsc.gov.in",
    preparationMonths: 15,
    difficulty: "HIGH",
    competitionNote:
      "Considerably better odds than UPSC CSE, and much of the preparation overlaps — many candidates prepare for both simultaneously.",
    stages: [
      {
        name: "Preliminary Examination",
        pattern: [
          { paper: "General Studies Paper I", marks: 200, questions: 150, durationMinutes: 120 },
          { paper: "General Studies Paper II (CSAT)", marks: 200, questions: 100, durationMinutes: 120, note: "Qualifying in most states." },
        ],
        marksTotal: 400,
        negativeMarking: true,
        negativeMarkingRatio: "Typically one third; varies by state",
        isQualifyingOnly: true,
      },
      {
        name: "Main Examination",
        pattern: [
          { paper: "General Studies papers", note: "Number and marks vary by state." },
          { paper: "Language papers", note: "State language and English, often qualifying." },
          { paper: "Essay", note: "Included in most states." },
          { paper: "Optional subject", note: "Retained by some states, dropped by others." },
        ],
      },
      { name: "Interview", pattern: [{ paper: "Personality test before a board" }] },
    ],
    selection: [
      { name: "Preliminary", description: "Screening stage." },
      { name: "Mains", description: "Descriptive papers with significant state-specific content." },
      { name: "Interview", description: "Personality test." },
      { name: "Final merit", description: "Mains plus interview, per the state's weighting." },
    ],
    syllabus: [
      {
        subject: "State-specific Studies",
        topics: [
          { topic: "State history and culture", weight: 5 },
          { topic: "State geography and economy", weight: 5 },
          { topic: "State polity and administration", weight: 4 },
          { topic: "State government schemes", weight: 4 },
        ],
      },
      {
        subject: "General Studies",
        topics: [
          { topic: "Indian polity and constitution", weight: 4 },
          { topic: "Modern Indian history", weight: 4 },
          { topic: "Indian and world geography", weight: 4 },
          { topic: "Indian economy", weight: 4 },
          { topic: "Environment and ecology", weight: 3 },
          { topic: "Science and technology", weight: 3 },
        ],
      },
      {
        subject: "Current Affairs",
        topics: [
          { topic: "State-level current affairs", weight: 5 },
          { topic: "National current affairs", weight: 4 },
        ],
      },
      { subject: "Answer Writing", topics: [{ topic: "Structured answer practice in the state's medium", weight: 4 }] },
    ],
    resources: [
      { kind: "official", title: "Your State Public Service Commission website", budgetTier: "free", note: "Each state publishes its own syllabus and notification. Start there, not with a generic book." },
      { kind: "free_resource", title: "State government economic survey and gazetteer", budgetTier: "free", note: "The best source for state-specific content, and free." },
      { kind: "free_resource", title: "NCERT textbooks", url: "https://ncert.nic.in/textbook.php", budgetTier: "free" },
      { kind: "practice", title: "State PSC previous year papers", budgetTier: "free" },
    ],
  },
];
