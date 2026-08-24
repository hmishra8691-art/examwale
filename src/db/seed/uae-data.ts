/**
 * United Arab Emirates career corpus.
 *
 * This file is the Phase 3 proof. Launching a second country was supposed to be
 * a content operation rather than an engineering one, and the honest way to
 * test that claim is to actually do it: everything below is data, loaded by a
 * loader that adds no new tables, columns, endpoints or components.
 *
 * Writing it surfaced how much of "career guidance" is jurisdiction-specific in
 * ways a schema cannot capture, and those differences are stated in the content
 * rather than smoothed over:
 *
 *  - **Employment is visa-sponsored.** For the roughly 88% of the population
 *    who are expatriates, the job and the right to remain are the same object.
 *    Losing one loses the other, on a clock. No Indian career guide needs a
 *    field for that, and no UI change was made for it either — it belongs in
 *    `disadvantages` and `eligibility`, where a reader will actually meet it.
 *  - **Emiratisation is real and asymmetric.** Nafis targets mean some private
 *    -sector roles are actively reserved for Emirati nationals. A guide that
 *    described the market without saying so would be useless to both audiences.
 *  - **There is no UPSC.** The UAE has no competitive national civil-service
 *    examination, so the exams section is marked NOT_APPLICABLE rather than
 *    left to render as an empty list.
 *
 * Money is in AED per year, gross. Income tax is nil for individuals, which
 * makes UAE gross figures much closer to take-home than Indian ones — a
 * comparison readers make constantly and get wrong, so several entries say it
 * outright. Figures are PLANNING RANGES, seeded as ESTIMATED, and deliberately
 * wide. Housing is the dominant cost and is excluded from every figure unless
 * an entry says otherwise.
 */
import type { CareerSeed } from "@/db/seed/careers-data";

const K = 1_000;

/**
 * Repeated in several entries because it is the single most consequential fact
 * about working here and readers routinely discover it too late.
 */
const VISA_NOTE = {
  label: "Right to work",
  detail:
    "Employment is tied to a sponsored residence visa. If the job ends, you generally have a limited grace period to find another sponsor or leave. Budget for that risk the way you would budget for anything else.",
};

const EMIRATISATION_NOTE = {
  label: "Emiratisation",
  detail:
    "Private-sector firms above a size threshold have Emirati hiring targets under the Nafis programme. For UAE nationals this means active recruitment and salary support; for expatriates it means some roles are effectively closed. Which is which changes, so check current Nafis guidance rather than assuming.",
};

export const UAE_CAREERS: CareerSeed[] = [
  // ===================== TECHNOLOGY =====================
  {
    slug: "software-developer-ae",
    occupation: "Software Developer",
    group: "technology",
    description:
      "Designs, writes and maintains the software behind applications, platforms and internal systems.",
    summary:
      "Build and maintain software for banks, government digital programmes, logistics firms and a growing startup sector concentrated in Dubai and Abu Dhabi. One of the few fields here where demonstrable work can outweigh a degree — though the visa system still prefers a degree, which is a separate problem from what employers want.",
    dayToDay:
      "Mostly reading and modifying existing code rather than writing new systems. Code review, defect fixing, and requirement conversations with product people. Teams are unusually multinational even by industry standards, so a lot of the job is communicating precisely across first languages and time zones.",
    workEnvironment:
      "Office or hybrid, desk-based. Concentrated in Dubai Internet City, DIFC, Abu Dhabi's Hub71 and Masdar City. Fully remote roles exist but are usually with overseas employers, which does not give you a UAE visa.",
    education: [
      {
        label: "Bachelor's in Computer Science, IT or Software Engineering",
        detail:
          "The conventional route. Also the practical one: an attested degree materially simplifies the employment visa, whatever the hiring manager thinks.",
        mandatory: false,
      },
      {
        label: "Any bachelor's degree plus demonstrable ability",
        detail: "Common and widely accepted by employers, and still satisfies the visa paperwork.",
      },
      {
        label: "No degree",
        detail:
          "Employers do hire on portfolio alone, but the visa route is harder and some categories require attested qualifications. Expect a longer search and fewer employers willing to sponsor.",
      },
    ],
    eligibility: [
      VISA_NOTE,
      {
        label: "Degree attestation",
        detail:
          "Qualifications earned abroad generally need attestation by the issuing country's authorities and the UAE mission there. Start it before you need it — it routinely takes weeks and cannot be rushed at the end.",
      },
      {
        label: "What employers screen on",
        detail:
          "Working systems you can point at, data structures and algorithms at the larger firms, and evidence you have shipped and maintained something rather than only built it.",
      },
    ],
    timeMonths: [36, 48],
    cost: [0, 220 * K],
    lowCost: [
      {
        label: "Arrive already qualified",
        detail:
          "The majority route. Most developers here did their degree elsewhere — frequently India, Pakistan, the Philippines, Egypt or Jordan — at a fraction of UAE tuition.",
        approxCost: 0,
      },
      {
        label: "Self-taught with a public portfolio",
        detail:
          "Viable for employers who hire on evidence. The constraint is visa sponsorship, not skill.",
        approxCost: 2 * K,
      },
    ],
    salary: { entry: [90 * K, 156 * K], mid: [156 * K, 260 * K], senior: [260 * K, 480 * K] },
    remote: true,
    freelancing: true,
    internationalNote:
      "No personal income tax, so gross is close to net — but compare against housing, which is the largest single expense and is often only partly covered by an allowance.",
    automationRisk: "MEDIUM",
    demand: "HIGH",
    competition: "HIGH",
    difficulty: "MEDIUM",
    advantages: [
      "No personal income tax on salary.",
      "Genuine demand across banking, logistics, government digital programmes and startups.",
      "Skill is portable — this is one of the easier fields from which to move country again.",
      "Some senior and specialist technology roles qualify for the Golden Visa, which decouples residence from a single employer.",
    ],
    disadvantages: [
      "Your residence depends on your employer until and unless you obtain a Golden Visa.",
      "Salaries vary sharply by nationality for the same work — an uncomfortable and well-documented feature of the market rather than an occasional abuse.",
      "Housing costs in Dubai and Abu Dhabi consume much of the tax advantage.",
      "Redundancy means finding a new sponsor within a limited window, not simply finding a new job.",
    ],
    progression: [
      { stage: "Junior developer", typicalYears: "0–2" },
      { stage: "Developer", typicalYears: "2–5" },
      { stage: "Senior developer", typicalYears: "5–9" },
      {
        stage: "Lead / architect / engineering manager",
        typicalYears: "9+",
        note: "Beyond this, most growth is via regional roles covering the wider GCC.",
      },
    ],
    nextSteps: [
      "Build two or three things that work and are publicly visible.",
      "Begin degree attestation before applying, not after an offer.",
      "Target firms that already sponsor visas at your level — check whether their current openings say so.",
      "Check whether your specialism appears on the current Golden Visa skilled-professional list.",
    ],
    skills: ["Programming", "Problem solving", "Communication", "Teamwork"],
    related: ["cybersecurity-analyst-ae", "data-analyst-ae"],
  },
  {
    slug: "cybersecurity-analyst-ae",
    occupation: "Cybersecurity Analyst",
    group: "technology",
    description: "Protects systems and data from intrusion, and responds when it happens anyway.",
    summary:
      "Monitor, defend and investigate. Demand is strong and structural: the UAE is a high-value target, and both federal regulation and banking supervision now mandate security functions that did not formally exist a decade ago.",
    dayToDay:
      "Alert triage, log analysis, vulnerability management, and writing up findings for people who are not technical. Incident work is unpredictable and can be unsociable. A good deal of the role is compliance evidence rather than adversarial defence, which surprises people who came in expecting the latter.",
    workEnvironment:
      "Office-based, often with on-call rotation. Banking, government, oil and gas, aviation and telecoms are the main employers.",
    education: [
      {
        label: "Bachelor's in Computer Science, IT or Cybersecurity",
        detail: "The standard entry qualification and the simplest for visa purposes.",
        mandatory: false,
      },
      {
        label: "Industry certification",
        detail:
          "CompTIA Security+ to enter; CISSP, OSCP or CISM to progress. Employers here weigh certifications more heavily than in many markets.",
      },
    ],
    eligibility: [
      VISA_NOTE,
      {
        label: "Background checks",
        detail:
          "Government, defence and banking roles involve security clearance and can restrict eligibility by nationality. This is rarely stated in the advert and is worth asking about early.",
      },
    ],
    timeMonths: [36, 60],
    cost: [8 * K, 200 * K],
    lowCost: [
      {
        label: "Certification-first route",
        detail:
          "Security+ then a home-lab portfolio. Cheaper than a second degree and taken seriously here.",
        approxCost: 8 * K,
      },
    ],
    salary: { entry: [96 * K, 168 * K], mid: [168 * K, 300 * K], senior: [300 * K, 540 * K] },
    remote: false,
    automationRisk: "LOW",
    demand: "VERY_HIGH",
    competition: "MEDIUM",
    difficulty: "HIGH",
    advantages: [
      "Demand outstrips local supply, which strengthens your position in negotiation.",
      "Regulatory requirements mean the budget is committed rather than discretionary.",
      "Clear certification ladder with pay attached to each rung.",
    ],
    disadvantages: [
      "On-call and incident work disrupts life outside work, genuinely and often.",
      "Some employers want compliance paperwork and describe it as security engineering.",
      "Clearance requirements can exclude certain nationalities from the best-paid roles.",
    ],
    progression: [
      { stage: "SOC analyst (L1)", typicalYears: "0–2" },
      { stage: "Analyst (L2/L3)", typicalYears: "2–5" },
      { stage: "Security engineer / incident responder", typicalYears: "5–8" },
      { stage: "Security manager / CISO", typicalYears: "8+" },
    ],
    nextSteps: [
      "Take Security+ if you have no certification yet.",
      "Build a home lab and document what you did with it.",
      "Ask early whether a target role has a nationality or clearance restriction.",
    ],
    skills: ["Problem solving", "Communication", "Programming"],
    related: ["software-developer-ae"],
  },
  {
    slug: "data-analyst-ae",
    occupation: "Data Analyst",
    group: "technology",
    description: "Turns organisational data into answers people can act on.",
    summary:
      "Reporting, dashboards and analysis for retail, banking, logistics and government. A common entry point into technology for people with a numerate degree in something else.",
    dayToDay:
      "SQL, spreadsheets and a BI tool, plus a surprising amount of chasing down what a figure actually means and who owns it. Much of the value is in asking the question properly before answering it.",
    workEnvironment: "Office or hybrid. Dubai and Abu Dhabi, across most large employers.",
    education: [
      {
        label: "Bachelor's in any numerate subject",
        detail: "Economics, engineering, statistics, business — all normal routes in.",
        mandatory: false,
      },
      {
        label: "Analytics certification",
        detail: "A recognised BI or analytics certificate helps when the degree is unrelated.",
      },
    ],
    eligibility: [VISA_NOTE],
    timeMonths: [24, 48],
    cost: [4 * K, 180 * K],
    lowCost: [
      {
        label: "SQL and a BI tool, self-taught",
        detail: "The two skills that actually get interviews. Both learnable without tuition.",
        approxCost: 2 * K,
      },
    ],
    salary: { entry: [78 * K, 132 * K], mid: [132 * K, 216 * K], senior: [216 * K, 380 * K] },
    remote: true,
    freelancing: true,
    automationRisk: "MEDIUM",
    demand: "HIGH",
    competition: "HIGH",
    difficulty: "MEDIUM",
    advantages: [
      "Accessible from a non-technology background.",
      "Transfers into data engineering or data science with deliberate effort.",
      "Wanted across almost every sector rather than concentrated in one.",
    ],
    disadvantages: [
      "Routine reporting is increasingly automated; the defensible part is the judgement, not the query.",
      "Crowded at entry level.",
      "Job titles are used loosely — confirm what the work actually is before accepting.",
    ],
    progression: [
      { stage: "Junior analyst", typicalYears: "0–2" },
      { stage: "Analyst", typicalYears: "2–5" },
      { stage: "Senior analyst / analytics lead", typicalYears: "5+" },
    ],
    nextSteps: [
      "Get genuinely good at SQL before anything else.",
      "Rebuild a public dataset into a dashboard that answers a real question.",
    ],
    skills: ["Data analysis", "Problem solving", "Communication"],
    related: ["software-developer-ae", "accountant-ae"],
  },

  // ===================== HEALTHCARE =====================
  {
    slug: "registered-nurse-ae",
    occupation: "Registered Nurse",
    group: "healthcare",
    description: "Delivers and coordinates patient care in hospitals and clinics.",
    summary:
      "Large, continuous demand across public and private healthcare. The gate is licensing, not hiring: you cannot practise until the relevant health authority has licensed you, and that process is the part people underestimate.",
    dayToDay:
      "Shift-based patient care, medication administration, observation and documentation, coordinating with physicians and families. Wards are multinational and multilingual; Arabic is useful and occasionally necessary.",
    workEnvironment:
      "Hospitals and clinics across all seven emirates. Shift work including nights and weekends. Physically and emotionally demanding.",
    education: [
      {
        label: "Bachelor of Science in Nursing",
        detail:
          "The standard requirement. Diploma-qualified nurses face materially narrower licensing options.",
        mandatory: true,
      },
      {
        label: "Post-qualification experience",
        detail:
          "Licensing authorities generally require around two years of recent clinical experience after qualifying. Newly qualified nurses usually cannot come straight here.",
      },
    ],
    eligibility: [
      VISA_NOTE,
      {
        label: "Health authority licence",
        detail:
          "DHA in Dubai, DOH in Abu Dhabi, MOHAP for the northern emirates. Each licenses separately, each requires an examination and primary-source verification of your credentials, and a licence in one emirate does not automatically let you work in another.",
      },
      {
        label: "Credential verification",
        detail:
          "Your qualifications and registration are verified directly with the issuing institutions through an approved agency. Allow months, not weeks, and expect to pay for it.",
      },
    ],
    timeMonths: [48, 72],
    cost: [10 * K, 260 * K],
    lowCost: [
      {
        label: "Qualify in your home country first",
        detail:
          "Almost everyone does. Nursing education in India or the Philippines costs a small fraction of the UAE equivalent, and both are well recognised by the licensing authorities.",
        approxCost: 0,
      },
    ],
    salary: { entry: [66 * K, 108 * K], mid: [108 * K, 168 * K], senior: [168 * K, 264 * K] },
    remote: false,
    internationalNote:
      "Accommodation and transport are frequently provided by hospital employers, which changes the comparison with a higher headline salary elsewhere more than people expect.",
    automationRisk: "VERY_LOW",
    demand: "VERY_HIGH",
    competition: "MEDIUM",
    difficulty: "HIGH",
    advantages: [
      "Consistent demand and a genuinely portable qualification.",
      "Employer-provided housing and transport are common.",
      "No personal income tax.",
      "Clear specialisation routes — critical care, theatre, midwifery — with pay attached.",
    ],
    disadvantages: [
      "Licensing is slow, expensive and must be repeated per emirate.",
      "Pay varies markedly by nationality of qualification, which is widely documented.",
      "Shift work, including nights, indefinitely.",
      "Emotionally heavy work with limited structural support in some employers.",
    ],
    progression: [
      { stage: "Staff nurse", typicalYears: "0–3" },
      { stage: "Senior staff nurse", typicalYears: "3–7" },
      { stage: "Charge nurse / specialist", typicalYears: "7–12" },
      { stage: "Nurse manager", typicalYears: "12+" },
    ],
    nextSteps: [
      "Confirm which emirate you are targeting, then read that authority's requirements specifically.",
      "Begin credential verification early — it is the long pole.",
      "Accumulate the required post-qualification clinical experience before applying.",
    ],
    licensing:
      "Mandatory licence from DHA, DOH or MOHAP depending on emirate. Practising without one is unlawful.",
    regulated: true,
    skills: ["Patient care", "Communication", "Teamwork", "Problem solving"],
    related: ["general-practitioner-ae"],
  },
  {
    slug: "general-practitioner-ae",
    occupation: "General Practitioner",
    group: "healthcare",
    description: "Diagnoses and treats patients in primary care.",
    summary:
      "Well paid and in demand, behind a licensing process that is deliberately demanding. The clinical work is familiar; the administrative route into it is the hard part.",
    dayToDay:
      "Consultations, diagnosis, prescribing, referral, and a substantial amount of insurance documentation. Patient populations are highly multinational, so presentations and health beliefs vary more than in a single-nationality system.",
    workEnvironment: "Clinics and hospitals, private and public. Long hours are common in private practice.",
    education: [
      {
        label: "Recognised medical degree",
        detail: "MBBS, MD or equivalent from an institution the licensing authority recognises.",
        mandatory: true,
      },
      {
        label: "Internship and post-qualification experience",
        detail:
          "A completed internship plus, in most cases, at least two to three years of practice after qualification.",
      },
    ],
    eligibility: [
      VISA_NOTE,
      {
        label: "Health authority licence",
        detail:
          "DHA, DOH or MOHAP. Involves a qualifying examination, primary-source verification, and an assessment interview for some categories.",
      },
      {
        label: "Recognised institution",
        detail:
          "Not every medical school is recognised by every authority. Check the current recognised list before committing — this is the most common reason applications fail outright.",
      },
    ],
    timeMonths: [96, 132],
    cost: [40 * K, 900 * K],
    lowCost: [
      {
        label: "Qualify elsewhere and license here",
        detail: "The overwhelmingly normal path. Very few practising GPs here trained in the UAE.",
        approxCost: 0,
      },
    ],
    salary: { entry: [180 * K, 300 * K], mid: [300 * K, 540 * K], senior: [540 * K, 960 * K] },
    remote: false,
    automationRisk: "VERY_LOW",
    demand: "HIGH",
    competition: "MEDIUM",
    difficulty: "VERY_HIGH",
    advantages: [
      "High earnings with no income tax.",
      "Strong demand, particularly outside Dubai and Abu Dhabi.",
      "Physicians in several specialities are eligible for the Golden Visa, which removes employer dependence.",
    ],
    disadvantages: [
      "Licensing is long, costly and emirate-specific.",
      "Recognition of your medical school is decided by the authority, not by you.",
      "Private-sector workload can be heavy and target-driven.",
      "Insurance administration takes real time away from patients.",
    ],
    progression: [
      { stage: "General practitioner", typicalYears: "0–5" },
      { stage: "Specialist (with further qualification)", typicalYears: "5–10" },
      { stage: "Consultant", typicalYears: "10+" },
    ],
    nextSteps: [
      "Check your medical school against the target authority's recognised list first. Everything else is wasted effort if it is not on there.",
      "Budget properly for verification and examination fees.",
    ],
    licensing: "Mandatory. DHA, DOH or MOHAP depending on emirate.",
    regulated: true,
    skills: ["Patient care", "Problem solving", "Communication"],
    related: ["registered-nurse-ae"],
  },

  // ===================== ENGINEERING =====================
  {
    slug: "civil-engineer-ae",
    occupation: "Civil Engineer",
    group: "engineering",
    description: "Designs and supervises construction of buildings and infrastructure.",
    summary:
      "Construction is a defining industry here and the work is genuinely large in scale. It is also cyclical, and the downturns are sharp — which matters more than usual when your visa depends on the job.",
    dayToDay:
      "Split between design office and site. Drawings, specifications, contractor coordination, inspections, and a great deal of documentation. Summer site work is physically punishing; a statutory midday break applies in the hottest months for outdoor work.",
    workEnvironment:
      "Consultancies, contractors and developers, plus municipality roles. Site work involves extreme summer heat.",
    education: [
      {
        label: "Bachelor's in Civil Engineering",
        detail: "Required. The degree must be attested and, for registration, recognised.",
        mandatory: true,
      },
      {
        label: "Society of Engineers registration",
        detail:
          "UAE Society of Engineers membership and municipality registration are needed to sign off work at senior grades.",
      },
    ],
    eligibility: [
      VISA_NOTE,
      EMIRATISATION_NOTE,
      {
        label: "Engineer registration",
        detail:
          "Registration grade depends on qualification and verified experience, and it governs what you are permitted to approve.",
      },
    ],
    timeMonths: [48, 60],
    cost: [15 * K, 300 * K],
    lowCost: [
      {
        label: "Degree from home country",
        detail: "Standard route. Ensure the institution is recognised for registration purposes.",
        approxCost: 0,
      },
    ],
    salary: { entry: [84 * K, 144 * K], mid: [144 * K, 252 * K], senior: [252 * K, 480 * K] },
    remote: false,
    automationRisk: "LOW",
    demand: "HIGH",
    competition: "HIGH",
    difficulty: "HIGH",
    advantages: [
      "Projects are unusually large, which is genuinely good experience.",
      "Registration and experience here are respected across the wider Gulf.",
      "No income tax.",
    ],
    disadvantages: [
      "Strongly cyclical — construction downturns produce mass redundancies, and redundancy here starts a visa clock.",
      "Site conditions in summer are severe.",
      "Payment disputes down the contracting chain are common and can affect salaries.",
      "Long hours are normalised in contracting.",
    ],
    progression: [
      { stage: "Graduate engineer", typicalYears: "0–3" },
      { stage: "Site / design engineer", typicalYears: "3–7" },
      { stage: "Senior engineer", typicalYears: "7–12" },
      { stage: "Project manager / engineering manager", typicalYears: "12+" },
    ],
    nextSteps: [
      "Attest your degree early.",
      "Understand the registration grades and what each permits you to sign.",
      "Ask about the employer's project pipeline, not just the current project — that is what determines your job security.",
    ],
    regulated: true,
    skills: ["Problem solving", "Project management", "Communication", "Teamwork"],
    related: ["quantity-surveyor-ae", "electrician-ae"],
  },
  {
    slug: "quantity-surveyor-ae",
    occupation: "Quantity Surveyor",
    group: "engineering",
    description: "Controls cost and contract on construction projects.",
    summary:
      "Costing, valuation and claims on large projects. Less exposed to fashion than design roles and consistently in demand while construction runs.",
    dayToDay:
      "Measurement, bills of quantities, valuing work done, variations, and contract correspondence. Claims work becomes adversarial and requires precision under pressure.",
    workEnvironment: "Consultancy or contractor, split between office and site.",
    education: [
      {
        label: "Bachelor's in Quantity Surveying, Civil Engineering or Construction Management",
        detail: "The standard entry qualification.",
        mandatory: false,
      },
      {
        label: "RICS membership",
        detail: "Valued highly here and often the difference at senior level.",
      },
    ],
    eligibility: [VISA_NOTE],
    timeMonths: [36, 60],
    cost: [15 * K, 260 * K],
    salary: { entry: [78 * K, 138 * K], mid: [138 * K, 240 * K], senior: [240 * K, 420 * K] },
    remote: false,
    automationRisk: "MEDIUM",
    demand: "HIGH",
    competition: "MEDIUM",
    difficulty: "MEDIUM",
    advantages: [
      "Contract and claims expertise is scarce and well paid.",
      "RICS routes are recognised internationally.",
      "Less cyclical than design roles — cost control matters most when money is tight.",
    ],
    disadvantages: [
      "Claims work is confrontational by nature.",
      "Still exposed to construction cycles.",
      "Errors carry direct financial consequences and are visible.",
    ],
    progression: [
      { stage: "Assistant QS", typicalYears: "0–3" },
      { stage: "Quantity surveyor", typicalYears: "3–7" },
      { stage: "Senior QS", typicalYears: "7–12" },
      { stage: "Commercial manager", typicalYears: "12+" },
    ],
    nextSteps: [
      "Work towards RICS if you intend to stay in the region.",
      "Learn the standard forms of contract used here, particularly FIDIC.",
    ],
    skills: ["Problem solving", "Project management", "Data analysis"],
    related: ["civil-engineer-ae"],
  },

  // ===================== FINANCE =====================
  {
    slug: "accountant-ae",
    occupation: "Accountant",
    group: "finance",
    description: "Maintains financial records and prepares statutory reporting.",
    summary:
      "Steady demand, and structurally rising: corporate tax arrived in 2023 and VAT in 2018, so compliance work that simply did not exist here a decade ago is now mandatory for most businesses.",
    dayToDay:
      "Bookkeeping, reconciliations, month-end close, VAT returns and now corporate tax filings. Audit season is intense. Multi-currency and inter-company work is routine given how many businesses here are regional headquarters.",
    workEnvironment: "Office-based across almost every sector. Free-zone and mainland entities have different filing obligations.",
    education: [
      {
        label: "Bachelor's in Accounting, Finance or Commerce",
        detail: "The usual entry requirement.",
        mandatory: false,
      },
      {
        label: "Professional qualification",
        detail:
          "ACCA, CPA, CA or CMA. ACCA is especially common here and materially changes both pay and mobility.",
      },
    ],
    eligibility: [
      VISA_NOTE,
      {
        label: "Tax knowledge",
        detail:
          "UAE corporate tax and VAT are recent. Demonstrating current knowledge of both is a genuine differentiator rather than an assumed baseline.",
      },
    ],
    timeMonths: [36, 72],
    cost: [12 * K, 200 * K],
    lowCost: [
      {
        label: "ACCA while working",
        detail:
          "Widely done here, exam by exam, paid for as you go and often partly funded by the employer.",
        approxCost: 25 * K,
      },
    ],
    salary: { entry: [66 * K, 120 * K], mid: [120 * K, 216 * K], senior: [216 * K, 420 * K] },
    remote: true,
    freelancing: true,
    automationRisk: "HIGH",
    demand: "HIGH",
    competition: "HIGH",
    difficulty: "MEDIUM",
    advantages: [
      "Every business needs one, so demand is broad rather than sector-specific.",
      "Corporate tax has created a durable new category of work.",
      "ACCA and CPA are portable if you leave.",
    ],
    disadvantages: [
      "Routine bookkeeping is being automated and that will continue.",
      "Crowded at entry level, which suppresses starting pay.",
      "Audit and close periods mean long hours on a predictable schedule.",
    ],
    progression: [
      { stage: "Accounts assistant", typicalYears: "0–2" },
      { stage: "Accountant", typicalYears: "2–5" },
      { stage: "Senior accountant / finance manager", typicalYears: "5–10" },
      { stage: "Financial controller / CFO", typicalYears: "10+" },
    ],
    nextSteps: [
      "Start ACCA or an equivalent if you intend to progress past senior accountant.",
      "Learn UAE corporate tax and VAT specifically — general accounting knowledge is not the scarce part.",
    ],
    skills: ["Data analysis", "Problem solving", "Communication"],
    related: ["data-analyst-ae", "financial-analyst-ae"],
  },
  {
    slug: "financial-analyst-ae",
    occupation: "Financial Analyst",
    group: "finance",
    description: "Analyses financial performance and supports investment and planning decisions.",
    summary:
      "Banking, asset management, family offices and corporate FP&A, concentrated in DIFC and ADGM. Competitive to enter and well paid once in.",
    dayToDay:
      "Modelling, variance analysis, forecasting and preparing material for people who will make decisions from one page of it. Deadline-driven around reporting cycles.",
    workEnvironment: "Office-based, DIFC and ADGM predominantly. Long hours in banking; more moderate in corporate roles.",
    education: [
      {
        label: "Bachelor's in Finance, Economics, Accounting or a numerate subject",
        detail: "Standard requirement.",
        mandatory: false,
      },
      { label: "CFA", detail: "Strongly valued in investment roles and often expected." },
    ],
    eligibility: [VISA_NOTE],
    timeMonths: [36, 84],
    cost: [15 * K, 260 * K],
    salary: { entry: [96 * K, 168 * K], mid: [168 * K, 320 * K], senior: [320 * K, 700 * K] },
    remote: false,
    automationRisk: "MEDIUM",
    demand: "MEDIUM",
    competition: "VERY_HIGH",
    difficulty: "HIGH",
    advantages: [
      "Among the highest earning ceilings outside medicine.",
      "DIFC and ADGM give access to genuine regional deal flow.",
      "CFA is portable anywhere.",
    ],
    disadvantages: [
      "Very competitive, and entry often depends on where you studied.",
      "Hours in investment banking are severe.",
      "Headcount is cut quickly when markets turn, and that means visa exposure.",
    ],
    progression: [
      { stage: "Analyst", typicalYears: "0–3" },
      { stage: "Senior analyst", typicalYears: "3–6" },
      { stage: "Manager / VP", typicalYears: "6–12" },
      { stage: "Director and above", typicalYears: "12+" },
    ],
    nextSteps: [
      "Begin CFA Level I if targeting investment roles.",
      "Get genuinely fluent in financial modelling — it is tested directly at interview.",
    ],
    skills: ["Data analysis", "Problem solving", "Communication"],
    related: ["accountant-ae"],
  },

  // ===================== EDUCATION =====================
  {
    slug: "school-teacher-ae",
    occupation: "School Teacher",
    group: "education",
    description: "Teaches in private and international schools.",
    summary:
      "The UAE has one of the largest private-school sectors anywhere, running British, American, IB, Indian and other curricula. Packages usually include housing and flights, which changes the comparison with home-country salaries substantially.",
    dayToDay:
      "Teaching, planning, marking and parent communication. Classes are highly multinational. KHDA and ADEK inspection regimes mean documented evidence of practice is a real and continuing part of the job.",
    workEnvironment:
      "Private and international schools across all emirates. Long summer break. Fixed-term contracts, typically two years, are the norm.",
    education: [
      {
        label: "Bachelor's degree in the subject or in Education",
        detail: "Required, and must be attested.",
        mandatory: true,
      },
      {
        label: "Teaching qualification",
        detail:
          "PGCE, B.Ed or equivalent. Required by most reputable schools and by the regulators for many roles.",
      },
      {
        label: "Experience",
        detail: "Two years of post-qualification classroom experience is a common minimum.",
      },
    ],
    eligibility: [
      VISA_NOTE,
      {
        label: "Attestation",
        detail:
          "Degree and teaching qualification both require attestation. Schools will not complete your visa without it.",
      },
      {
        label: "Curriculum match",
        detail:
          "Schools recruit for a specific curriculum. Experience in the matching curriculum matters more than general teaching experience.",
      },
    ],
    timeMonths: [48, 60],
    cost: [15 * K, 240 * K],
    lowCost: [
      {
        label: "Qualify and gain experience at home first",
        detail: "The standard route, and the one schools expect.",
        approxCost: 0,
      },
    ],
    salary: { entry: [96 * K, 150 * K], mid: [150 * K, 216 * K], senior: [216 * K, 360 * K] },
    remote: false,
    internationalNote:
      "Packages commonly include accommodation or an allowance, annual flights and children's school fees. Those are worth a great deal and are frequently left out when people compare a UAE offer to a home-country salary.",
    automationRisk: "VERY_LOW",
    demand: "HIGH",
    competition: "MEDIUM",
    difficulty: "MEDIUM",
    advantages: [
      "Housing, flights and often school places for your own children.",
      "No income tax.",
      "Long summer break.",
      "International school experience is portable across many countries.",
    ],
    disadvantages: [
      "Fixed-term contracts mean recurring uncertainty rather than a settled position.",
      "School quality varies enormously; a weak employer is a hard two years.",
      "Parental and inspection pressure is significant.",
      "Pay differs by nationality at some schools, which is well documented.",
    ],
    progression: [
      { stage: "Teacher", typicalYears: "0–5" },
      { stage: "Head of department", typicalYears: "5–10" },
      { stage: "Senior leadership", typicalYears: "10+" },
    ],
    nextSteps: [
      "Attest your degree and teaching qualification before applying.",
      "Target schools running the curriculum you have taught.",
      "Check the school's most recent inspection rating — it is published, and it tells you a lot.",
    ],
    skills: ["Communication", "Teaching", "Patient care", "Problem solving"],
    related: [],
  },

  // ===================== LOGISTICS =====================
  {
    slug: "logistics-coordinator-ae",
    occupation: "Logistics Coordinator",
    group: "logistics",
    description: "Coordinates the movement of goods through ports, airports and warehouses.",
    summary:
      "The UAE is a global transshipment hub — Jebel Ali, Dubai and Abu Dhabi airports, and a large re-export trade. Logistics is one of the more accessible entry points into stable employment here.",
    dayToDay:
      "Booking shipments, customs documentation, tracking, and resolving the things that go wrong — which is most of the job. Coordination across time zones and languages is constant.",
    workEnvironment: "Offices, free zones, warehouses and ports. Shift patterns in operational roles.",
    education: [
      {
        label: "Bachelor's in Logistics, Supply Chain or Business",
        detail: "Usual requirement, though experience substitutes more readily here than elsewhere.",
        mandatory: false,
      },
      {
        label: "Diploma plus experience",
        detail: "A realistic route into operational roles.",
      },
    ],
    eligibility: [
      VISA_NOTE,
      {
        label: "Customs knowledge",
        detail:
          "Free-zone versus mainland customs treatment is a genuine specialism and worth learning properly.",
      },
    ],
    timeMonths: [24, 48],
    cost: [8 * K, 160 * K],
    lowCost: [
      {
        label: "Start operational, study alongside",
        detail:
          "Common and workable. Employers here promote from within in logistics more readily than in most sectors.",
        approxCost: 6 * K,
      },
    ],
    salary: { entry: [48 * K, 90 * K], mid: [90 * K, 156 * K], senior: [156 * K, 300 * K] },
    remote: false,
    automationRisk: "MEDIUM",
    demand: "HIGH",
    competition: "MEDIUM",
    difficulty: "LOW",
    advantages: [
      "Genuinely accessible without a specialised degree.",
      "The sector is structural to the UAE economy rather than a passing boom.",
      "Clear internal progression.",
    ],
    disadvantages: [
      "Entry pay is low relative to living costs, particularly in Dubai.",
      "Operational roles involve shifts and real time pressure.",
      "Warehouse-adjacent roles can be physically demanding in summer heat.",
    ],
    progression: [
      { stage: "Coordinator", typicalYears: "0–3" },
      { stage: "Senior coordinator / supervisor", typicalYears: "3–7" },
      { stage: "Logistics manager", typicalYears: "7–12" },
      { stage: "Supply chain manager", typicalYears: "12+" },
    ],
    nextSteps: [
      "Learn the difference between free-zone and mainland customs treatment.",
      "Target the large operators and freight forwarders — they hire continuously.",
    ],
    skills: ["Problem solving", "Communication", "Project management"],
    related: ["accountant-ae"],
  },

  // ===================== SKILLED TRADES =====================
  {
    slug: "electrician-ae",
    occupation: "Electrician",
    group: "skilled-trades",
    description: "Installs and maintains electrical systems in buildings and facilities.",
    summary:
      "Steady demand from construction and facilities management. Honest about the trade-off: this is a route to employment here without a degree, and it is also one of the harder working lives, especially in summer.",
    dayToDay:
      "Installation, testing, fault-finding and maintenance, on sites and in occupied buildings. Outdoor and unconditioned work in summer is genuinely hard, and a statutory midday break applies in the hottest months.",
    workEnvironment:
      "Construction sites, facilities management, industrial plant. Employer-provided shared accommodation is common in this segment.",
    education: [
      {
        label: "Trade certificate or diploma",
        detail: "An electrical trade qualification from a recognised institution.",
        mandatory: true,
      },
      {
        label: "Third-party certification",
        detail:
          "Some employers and free zones require additional testing or certification before you can work on their systems.",
      },
    ],
    eligibility: [
      VISA_NOTE,
      {
        label: "Contract terms",
        detail:
          "Read the offer carefully: accommodation, transport, overtime treatment and end-of-service gratuity vary widely in this segment and materially change what the job is worth.",
      },
    ],
    timeMonths: [12, 36],
    cost: [3 * K, 40 * K],
    lowCost: [
      {
        label: "Qualify at home, recruit from there",
        detail:
          "Most electricians here are recruited from India, Pakistan, Nepal, Bangladesh or the Philippines through agencies. Use a licensed agency, and never pay a recruitment fee — charging workers for recruitment is prohibited.",
        approxCost: 0,
      },
    ],
    salary: { entry: [24 * K, 54 * K], mid: [54 * K, 96 * K], senior: [96 * K, 180 * K] },
    remote: false,
    selfEmployment: false,
    internationalNote:
      "Accommodation, transport and food are frequently provided in this segment. That changes the comparison considerably, but confirm exactly what is included in writing before accepting anything.",
    automationRisk: "LOW",
    demand: "HIGH",
    competition: "MEDIUM",
    difficulty: "MEDIUM",
    advantages: [
      "Real route to employment without a degree.",
      "Accommodation and transport commonly provided.",
      "End-of-service gratuity accrues by law with length of service.",
      "Skills transfer directly to facilities management, which is steadier than construction.",
    ],
    disadvantages: [
      "Physically demanding in extreme summer heat.",
      "Pay at entry is low, and cost of living is not.",
      "This segment has a documented history of contract and wage disputes — check the employer before you travel.",
      "Working hours in contracting are long.",
    ],
    progression: [
      { stage: "Electrician", typicalYears: "0–5" },
      { stage: "Senior electrician / chargehand", typicalYears: "5–10" },
      { stage: "Electrical supervisor", typicalYears: "10–15" },
      { stage: "Facilities / MEP supervisor", typicalYears: "15+" },
    ],
    nextSteps: [
      "Use a licensed recruitment agency and never pay a fee to be hired.",
      "Get the full offer in writing — salary, accommodation, transport, overtime and gratuity.",
      "Aim at facilities management rather than pure contracting for steadier work.",
    ],
    skills: ["Problem solving", "Teamwork"],
    related: ["civil-engineer-ae"],
  },

  // ===================== BUSINESS =====================
  {
    slug: "digital-marketing-specialist-ae",
    occupation: "Digital Marketing Specialist",
    group: "business",
    description: "Plans and runs digital campaigns and channels.",
    summary:
      "Strong demand from a retail, property and hospitality economy that advertises heavily. Accessible without a specific degree, and one of the more realistic freelance options here — though freelancing requires its own permit.",
    dayToDay:
      "Campaign setup and optimisation, content, analytics and reporting. Arabic-English bilingual capability is a substantial and well-paid advantage.",
    workEnvironment: "Agencies, in-house teams and freelance. Dubai predominantly.",
    education: [
      {
        label: "Bachelor's in Marketing, Business or Communications",
        detail: "Common but not required — portfolio and results carry more weight.",
        mandatory: false,
      },
      {
        label: "Platform certifications",
        detail: "Google and Meta certifications are free and expected as a baseline.",
      },
    ],
    eligibility: [
      VISA_NOTE,
      {
        label: "Freelance permit",
        detail:
          "Freelancing legally requires a freelance permit or licence from a free zone or the relevant authority. Working freelance on an employment visa without permission is a real risk, not a technicality.",
      },
    ],
    timeMonths: [12, 48],
    cost: [2 * K, 180 * K],
    lowCost: [
      {
        label: "Free certifications plus real campaigns",
        detail:
          "Google and Meta certifications cost nothing. Run something real, even small, and report the numbers honestly.",
        approxCost: 1 * K,
      },
    ],
    salary: { entry: [54 * K, 102 * K], mid: [102 * K, 180 * K], senior: [180 * K, 340 * K] },
    remote: true,
    freelancing: true,
    selfEmployment: true,
    automationRisk: "HIGH",
    demand: "HIGH",
    competition: "HIGH",
    difficulty: "LOW",
    advantages: [
      "Entry does not depend on a specific degree.",
      "Freelance and agency routes both exist.",
      "Bilingual Arabic-English specialists are scarce and paid accordingly.",
    ],
    disadvantages: [
      "Generative tools are absorbing a meaningful share of routine content and campaign work.",
      "Agency hours and client pressure are demanding.",
      "Crowded at entry, and results are measured in public.",
      "Freelance work needs a permit, which costs money before you earn any.",
    ],
    progression: [
      { stage: "Executive", typicalYears: "0–2" },
      { stage: "Specialist", typicalYears: "2–5" },
      { stage: "Manager", typicalYears: "5–9" },
      { stage: "Head of marketing", typicalYears: "9+" },
    ],
    nextSteps: [
      "Complete the free Google and Meta certifications.",
      "Run one real campaign and document the result, including what did not work.",
      "If freelancing, price the permit in before you quote anyone.",
    ],
    skills: ["Communication", "Data analysis", "Problem solving"],
    related: ["data-analyst-ae"],
  },
];
