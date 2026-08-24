/**
 * Reference data: geography, education systems, taxonomy, sources.
 *
 * A note on provenance. This seed is a *starting corpus*, not a verified
 * dataset. Structural facts (exam stages, typical education routes) are
 * accurate to the best of the author's knowledge; every number that moves —
 * salary bands, course costs, vacancy counts, dates — is seeded as an
 * ESTIMATE against an EDITORIAL source and must be re-verified against the
 * primary source before this platform is put in front of real users. The
 * publish gate in modules/admin/publish.ts enforces that discipline for
 * anything created after seeding.
 */
import { db } from "@/db/client";
import {
  careerPathways,
  countries,
  educationStages,
  educationSystems,
  occupationGroups,
  qualifications,
  regions,
  skills,
  sources,
} from "@/db/schema";

export type ReferenceIds = {
  countryId: string;
  regionIds: Map<string, string>;
  educationSystemId: string;
  stageIds: Map<string, string>;
  groupIds: Map<string, string>;
  skillIds: Map<string, string>;
  sourceIds: Map<string, string>;
};

const INDIAN_REGIONS = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan",
  "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Delhi", "Jammu and Kashmir", "Ladakh", "Puducherry", "Chandigarh",
];

const OCCUPATION_GROUPS = [
  { slug: "technology", name: "Technology", icon: "💻", sequence: 1 },
  { slug: "engineering", name: "Engineering", icon: "⚙️", sequence: 2 },
  { slug: "healthcare", name: "Healthcare", icon: "🩺", sequence: 3 },
  { slug: "finance", name: "Finance & Accounts", icon: "📊", sequence: 4 },
  { slug: "legal", name: "Law & Compliance", icon: "⚖️", sequence: 5 },
  { slug: "government", name: "Government & Defence", icon: "🏛️", sequence: 6 },
  { slug: "business", name: "Business & Management", icon: "📈", sequence: 7 },
  { slug: "design", name: "Design & Creative", icon: "🎨", sequence: 8 },
  { slug: "education", name: "Education & Training", icon: "📚", sequence: 9 },
  { slug: "logistics", name: "Logistics & Transport", icon: "🚚", sequence: 10 },
  { slug: "skilled-trades", name: "Skilled Trades", icon: "🔧", sequence: 11 },
];

const SKILLS: { name: string; category: string }[] = [
  // Technology
  ...["Python","Java","JavaScript","TypeScript","SQL","React","Node.js","Django","Git","Linux",
      "AWS","Azure","Docker","Kubernetes","REST APIs","System Design","Data Structures",
      "Machine Learning","Deep Learning","TensorFlow","PyTorch","NLP","Computer Vision",
      "Pandas","NumPy","Power BI","Tableau","Excel","Statistics","Data Modelling",
      "Network Security","Penetration Testing","SIEM","Firewalls","Incident Response",
      "CI/CD","Terraform","Monitoring","Shell Scripting","MongoDB","PostgreSQL","Redis",
      "Android","iOS","Kotlin","Swift","Flutter","React Native","HTML","CSS","Figma",
     ].map((name) => ({ name, category: "technology" })),
  // Engineering
  ...["AutoCAD","SolidWorks","CATIA","ANSYS","Thermodynamics","Fluid Mechanics","STAAD Pro",
      "Structural Analysis","Surveying","Project Estimation","Circuit Design","PLC","SCADA",
      "Power Systems","Embedded C","VLSI","PCB Design","Process Design","HAZOP","Quality Control",
     ].map((name) => ({ name, category: "engineering" })),
  // Healthcare
  ...["Patient Care","Clinical Diagnosis","Pharmacology","Anatomy","Physiology","Surgery",
      "Radiology","Pathology","Emergency Care","Medical Records","Physiotherapy","Nutrition",
      "Dental Procedures","Nursing Care","Infection Control",
     ].map((name) => ({ name, category: "healthcare" })),
  // Finance & business
  ...["Accounting","Tally","GST","Income Tax","Auditing","Financial Modelling","Valuation",
      "Bookkeeping","Cost Accounting","Ind AS","Banking Operations","Credit Analysis",
      "Risk Management","Insurance Underwriting","Equity Research","Portfolio Management",
      "Business Development","Sales","Negotiation","CRM","Salesforce","Market Research",
      "Digital Marketing","SEO","Content Writing","Social Media","Google Analytics",
      "Supply Chain","Inventory Management","Procurement","Logistics Planning","Warehousing",
     ].map((name) => ({ name, category: "business" })),
  // Legal
  ...["Legal Research","Contract Drafting","Litigation","Corporate Law","Intellectual Property",
      "Compliance","Constitutional Law","Criminal Law",
     ].map((name) => ({ name, category: "legal" })),
  // Design & creative
  ...["Adobe Photoshop","Adobe Illustrator","InDesign","UI Design","UX Research","Prototyping",
      "Typography","Interior Design","3ds Max","SketchUp","Fashion Illustration","Pattern Making",
      "Video Editing","Motion Graphics",
     ].map((name) => ({ name, category: "design" })),
  // Trades
  ...["Electrical Wiring","Plumbing","Welding","HVAC Systems","CNC Machining","Fitting",
      "Automobile Repair","Carpentry","Masonry","Blueprint Reading","Safety Procedures",
     ].map((name) => ({ name, category: "trades" })),
  // Transferable
  ...["Communication","Leadership","Teamwork","Problem Solving","Time Management",
      "Project Management","Agile","Scrum","Public Speaking","Report Writing","Teaching",
      "Curriculum Design","Counselling","Recruitment","Payroll","General Studies",
      "Current Affairs","Quantitative Aptitude","Logical Reasoning","English Comprehension",
     ].map((name) => ({ name, category: "general" })),
];

const SOURCES = [
  {
    key: "editorial",
    name: "ExamWale editorial research",
    url: null,
    type: "EDITORIAL" as const,
    reliabilityTier: "TERTIARY" as const,
    notes:
      "Compiled starting corpus. Ranges are planning estimates, not quoted figures, and must be re-verified against primary sources before being relied on.",
  },
  { key: "upsc", name: "Union Public Service Commission", url: "https://upsc.gov.in", type: "OFFICIAL_GOVERNMENT" as const, reliabilityTier: "PRIMARY" as const },
  { key: "ssc", name: "Staff Selection Commission", url: "https://ssc.gov.in", type: "OFFICIAL_GOVERNMENT" as const, reliabilityTier: "PRIMARY" as const },
  { key: "ibps", name: "Institute of Banking Personnel Selection", url: "https://www.ibps.in", type: "OFFICIAL_GOVERNMENT" as const, reliabilityTier: "PRIMARY" as const },
  { key: "rrb", name: "Railway Recruitment Boards", url: "https://indianrailways.gov.in", type: "OFFICIAL_GOVERNMENT" as const, reliabilityTier: "PRIMARY" as const },
  { key: "nta", name: "National Testing Agency", url: "https://nta.ac.in", type: "OFFICIAL_GOVERNMENT" as const, reliabilityTier: "PRIMARY" as const },
  { key: "upsc-defence", name: "UPSC Defence Examinations", url: "https://upsc.gov.in", type: "OFFICIAL_GOVERNMENT" as const, reliabilityTier: "PRIMARY" as const },
  { key: "icai", name: "Institute of Chartered Accountants of India", url: "https://www.icai.org", type: "OFFICIAL_INSTITUTION" as const, reliabilityTier: "PRIMARY" as const },
  { key: "nmc", name: "National Medical Commission", url: "https://www.nmc.org.in", type: "OFFICIAL_GOVERNMENT" as const, reliabilityTier: "PRIMARY" as const },
  { key: "bci", name: "Bar Council of India", url: "https://www.barcouncilofindia.org", type: "OFFICIAL_INSTITUTION" as const, reliabilityTier: "PRIMARY" as const },
  { key: "aicte", name: "All India Council for Technical Education", url: "https://www.aicte-india.org", type: "OFFICIAL_GOVERNMENT" as const, reliabilityTier: "PRIMARY" as const },
  { key: "ncvet", name: "National Council for Vocational Education and Training", url: "https://ncvet.gov.in", type: "OFFICIAL_GOVERNMENT" as const, reliabilityTier: "PRIMARY" as const },
  { key: "scholarships", name: "National Scholarship Portal", url: "https://scholarships.gov.in", type: "OFFICIAL_GOVERNMENT" as const, reliabilityTier: "PRIMARY" as const },
];

const STAGES = [
  { slug: "class-8", name: "Class 8 or below", sequence: 1, description: "Middle school" },
  { slug: "class-10", name: "Class 10", sequence: 2, description: "Secondary school — the first major branching point" },
  { slug: "class-12", name: "Class 12", sequence: 3, description: "Senior secondary — stream chosen, entrance exams ahead" },
  { slug: "iti-diploma", name: "ITI / Diploma", sequence: 4, description: "Vocational or polytechnic qualification" },
  { slug: "undergraduate", name: "Undergraduate degree", sequence: 5, description: "Bachelor's degree, in progress or complete" },
  { slug: "postgraduate", name: "Postgraduate degree", sequence: 6, description: "Master's or professional qualification" },
  { slug: "doctorate", name: "Doctorate", sequence: 7, description: "PhD or equivalent" },
];

export async function seedReference(): Promise<ReferenceIds> {
  // --- Countries ---------------------------------------------------------
  const countryRows = await db
    .insert(countries)
    .values([
      { isoCode: "IN", name: "India", currencyCode: "INR", currencySymbol: "₹", defaultLocale: "en", isActive: true },
      // Seeded inactive to prove the country dimension works without pretending
      // we have content for them yet.
      { isoCode: "US", name: "United States", currencyCode: "USD", currencySymbol: "$", isActive: false },
      { isoCode: "GB", name: "United Kingdom", currencyCode: "GBP", currencySymbol: "£", isActive: false },
      { isoCode: "AE", name: "United Arab Emirates", currencyCode: "AED", currencySymbol: "AED ", isActive: false },
      { isoCode: "CA", name: "Canada", currencyCode: "CAD", currencySymbol: "C$", isActive: false },
      { isoCode: "AU", name: "Australia", currencyCode: "AUD", currencySymbol: "A$", isActive: false },
    ])
    .returning();

  const india = countryRows.find((row) => row.isoCode === "IN")!;

  // --- Regions -----------------------------------------------------------
  const regionRows = await db
    .insert(regions)
    .values(
      INDIAN_REGIONS.map((name) => ({
        countryId: india.id,
        name,
        type: ["Delhi", "Puducherry", "Chandigarh", "Jammu and Kashmir", "Ladakh"].includes(name)
          ? "union-territory"
          : "state",
      })),
    )
    .returning();

  const regionIds = new Map(regionRows.map((row) => [row.name, row.id]));

  // --- Education system --------------------------------------------------
  const [system] = await db
    .insert(educationSystems)
    .values({ countryId: india.id, name: "India — CBSE / State Boards", slug: "in-school" })
    .returning();

  const stageRows = await db
    .insert(educationStages)
    .values(STAGES.map((stage) => ({ ...stage, educationSystemId: system.id })))
    .returning();

  const stageIds = new Map(stageRows.map((row) => [row.slug, row.id]));

  await db.insert(qualifications).values([
    { educationSystemId: system.id, stageId: stageIds.get("class-10"), name: "Secondary School Certificate", level: "secondary", typicalYears: 10 },
    { educationSystemId: system.id, stageId: stageIds.get("class-12"), name: "Higher Secondary Certificate", level: "senior-secondary", typicalYears: 2 },
    { educationSystemId: system.id, stageId: stageIds.get("iti-diploma"), name: "ITI Certificate", level: "vocational", typicalYears: 2 },
    { educationSystemId: system.id, stageId: stageIds.get("iti-diploma"), name: "Polytechnic Diploma", level: "diploma", typicalYears: 3 },
    { educationSystemId: system.id, stageId: stageIds.get("undergraduate"), name: "Bachelor's Degree", level: "bachelor", typicalYears: 3 },
    { educationSystemId: system.id, stageId: stageIds.get("undergraduate"), name: "Bachelor of Technology", level: "bachelor", typicalYears: 4 },
    { educationSystemId: system.id, stageId: stageIds.get("undergraduate"), name: "MBBS", level: "professional", typicalYears: 5.5 },
    { educationSystemId: system.id, stageId: stageIds.get("postgraduate"), name: "Master's Degree", level: "master", typicalYears: 2 },
  ]);

  // --- Pathways ----------------------------------------------------------
  await db.insert(careerPathways).values([
    {
      fromStageId: stageIds.get("class-10")!,
      title: "What you can do after Class 10",
      description:
        "This is the most over-dramatised decision in Indian education. It matters, but it is not final — people move between these routes all the time, and several of them lead to the same destinations by different roads.",
      options: [
        {
          label: "Science (PCM)",
          slug: "science-pcm",
          summary:
            "Physics, Chemistry, Maths. Opens engineering, architecture, defence technical entry, pure sciences, and — because it keeps maths — most commerce and management routes too.",
          leadsToCareerSlugs: ["software-developer-in", "mechanical-engineer-in", "civil-engineer-in", "data-scientist-in"],
          note: "The widest-keeping-options-open choice, and the heaviest workload.",
        },
        {
          label: "Science (PCB)",
          slug: "science-pcb",
          summary:
            "Physics, Chemistry, Biology. The route to MBBS, dentistry, pharmacy, nursing, physiotherapy and allied health. Add maths if you want to keep engineering open too.",
          leadsToCareerSlugs: ["doctor-mbbs-in", "pharmacist-in", "nurse-in", "physiotherapist-in"],
        },
        {
          label: "Commerce",
          slug: "commerce",
          summary:
            "Accounts, business studies, economics. Leads to CA, CS, banking, finance, B.Com, BBA and most management routes. With maths, it also keeps economics and analytics open.",
          leadsToCareerSlugs: ["chartered-accountant-in", "financial-analyst-in", "bank-po-in", "accountant-in"],
        },
        {
          label: "Arts / Humanities",
          slug: "arts",
          summary:
            "History, political science, psychology, sociology, languages. Strong for civil services, law, journalism, teaching, design and social work. The 'last resort' reputation is undeserved and outdated.",
          leadsToCareerSlugs: ["ias-officer-in", "lawyer-in", "teacher-in", "psychologist-in"],
        },
        {
          label: "ITI (Industrial Training Institute)",
          slug: "iti",
          summary:
            "One or two years of trade training — electrician, fitter, welder, mechanic. Earning within two years of Class 10, and the trades are in genuine shortage.",
          leadsToCareerSlugs: ["electrician-in", "welder-in", "automobile-technician-in"],
          note: "The fastest route from school to a paying job, and the cheapest.",
        },
        {
          label: "Polytechnic diploma",
          slug: "diploma",
          summary:
            "Three-year engineering diploma. Work as a junior engineer, or enter a BTech in the second year through lateral entry — the same degree, one year sooner and much cheaper.",
          leadsToCareerSlugs: ["mechanical-engineer-in", "electrical-engineer-in", "civil-engineer-in"],
        },
        {
          label: "Vocational / skill courses",
          slug: "vocational",
          summary:
            "Retail, hospitality, healthcare support, IT support and similar. Short, practical and job-linked, often alongside Class 11 and 12.",
          leadsToCareerSlugs: ["customer-support-executive-in", "hotel-manager-in"],
        },
      ],
    },
    {
      fromStageId: stageIds.get("class-12")!,
      title: "What you can do after Class 12",
      description:
        "Your stream narrows the list but rarely closes it. Below is what each stream leads to, and where the crossovers are.",
      options: [
        {
          label: "Science PCM → Engineering",
          slug: "pcm-engineering",
          summary:
            "BTech or BE via JEE Main, state CETs, or direct private admission. Four years. Cost swings enormously — government colleges are a fraction of private ones for the same degree.",
          leadsToCareerSlugs: ["software-developer-in", "mechanical-engineer-in", "electrical-engineer-in", "civil-engineer-in"],
        },
        {
          label: "Science PCB → Medicine & allied health",
          slug: "pcb-medicine",
          summary:
            "MBBS, BDS, BAMS, BHMS, B.Pharm, BSc Nursing, BPT. NEET-UG is the single gate for most of these. Allied health routes are shorter, cheaper and far less competitive than MBBS.",
          leadsToCareerSlugs: ["doctor-mbbs-in", "dentist-in", "pharmacist-in", "nurse-in", "physiotherapist-in"],
        },
        {
          label: "Commerce → Finance & accounting",
          slug: "commerce-finance",
          summary:
            "B.Com, BBA, or straight into CA/CS/CMA after Class 12. The professional courses cost very little compared to a degree, but pass rates are low and they take real years.",
          leadsToCareerSlugs: ["chartered-accountant-in", "financial-analyst-in", "accountant-in", "company-secretary-in"],
        },
        {
          label: "Any stream → Law",
          slug: "law",
          summary:
            "Five-year integrated BA LLB via CLAT or state entrance exams, from any stream. Or a three-year LLB after any bachelor's degree.",
          leadsToCareerSlugs: ["lawyer-in", "corporate-lawyer-in"],
        },
        {
          label: "Any stream → Design",
          slug: "design",
          summary:
            "B.Des or BFA via NID DAT, UCEED or NIFT. Portfolio matters more than board marks. Architecture (B.Arch) needs PCM and NATA/JEE Paper 2.",
          leadsToCareerSlugs: ["ui-ux-designer-in", "graphic-designer-in", "interior-designer-in", "architect-in"],
        },
        {
          label: "Any stream → Defence",
          slug: "defence",
          summary:
            "NDA after Class 12 for the armed forces, CDS after graduation. PCM is required for the Air Force and Navy technical entries; the Army accepts any stream.",
          leadsToCareerSlugs: ["army-officer-in", "police-officer-in"],
        },
        {
          label: "Any stream → Government exams",
          slug: "government",
          summary:
            "SSC CHSL and RRB exams take Class 12 pass candidates directly. UPSC, SSC CGL and banking need a degree first — but you can start preparing while you study.",
          leadsToCareerSlugs: ["ias-officer-in", "bank-po-in", "railway-officer-in"],
        },
      ],
    },
  ]);

  // --- Taxonomy ----------------------------------------------------------
  const groupRows = await db.insert(occupationGroups).values(OCCUPATION_GROUPS).returning();
  const groupIds = new Map(groupRows.map((row) => [row.slug, row.id]));

  const skillRows = await db
    .insert(skills)
    .values(
      SKILLS.map((skill) => ({
        name: skill.name,
        slug: skill.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        category: skill.category,
      })),
    )
    .onConflictDoNothing()
    .returning();

  const skillIds = new Map(skillRows.map((row) => [row.name, row.id]));

  // --- Sources -----------------------------------------------------------
  const sourceRows = await db
    .insert(sources)
    .values(
      SOURCES.map((source) => ({
        name: source.name,
        url: source.url ?? null,
        type: source.type,
        reliabilityTier: source.reliabilityTier,
        countryId: india.id,
        notes: "notes" in source ? source.notes : null,
      })),
    )
    .returning();

  const sourceIds = new Map(SOURCES.map((source, index) => [source.key, sourceRows[index].id]));

  return {
    countryId: india.id,
    regionIds,
    educationSystemId: system.id,
    stageIds,
    groupIds,
    skillIds,
    sourceIds,
  };
}
