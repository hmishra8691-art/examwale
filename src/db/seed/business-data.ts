/**
 * Business model templates for the entrepreneurship module.
 *
 * Costs are planning estimates and vary enormously by city and scale. Licence
 * lists name the authority rather than asserting a fee or a timeline, because
 * both differ by state and change frequently. Nothing here projects profit.
 */

export type BusinessSeed = {
  slug: string;
  name: string;
  category: string;
  targetCustomer: string;
  summary: string;
  startupCost: [number, number];
  fixedCosts: { label: string; approxMonthly: number }[];
  variableCosts: { label: string; note: string }[];
  equipment: string[];
  licenses: { name: string; authority: string; note?: string }[];
  skills: string[];
  suppliersNote: string;
  marketingPlan: string[];
  pricingModel: string;
  revenueModel: string;
  breakEven: { assumptions: string[]; formula: string; note: string };
  risks: string[];
  competition: string;
  growth: string[];
  aiOpportunities: string[];
  launchPlan: { window: string; tasks: string[] }[];
};

export const BUSINESS_CATEGORIES = [
  { slug: "food", name: "Food & Beverage" },
  { slug: "retail", name: "Retail & E-commerce" },
  { slug: "services", name: "Local Services" },
  { slug: "digital", name: "Digital & Professional Services" },
  { slug: "transport", name: "Transport & Logistics" },
  { slug: "education", name: "Education & Training" },
  { slug: "manufacturing", name: "Small Manufacturing" },
];

export const BUSINESSES: BusinessSeed[] = [
  {
    slug: "tiffin-service-in",
    name: "Home Tiffin & Meal Delivery Service",
    category: "food",
    targetCustomer:
      "Working professionals, students and bachelors in a defined 3–5 km radius who want home-style food on a monthly subscription.",
    summary:
      "Cook from a home or small commercial kitchen and deliver daily meals on subscription. One of the lowest-capital food businesses to start, and one where the subscription model gives you predictable revenue from month one — if you can hold quality steady.",
    startupCost: [25_000, 1_50_000],
    fixedCosts: [
      { label: "Kitchen rent (if not home-based)", approxMonthly: 12_000 },
      { label: "Gas and utilities", approxMonthly: 4_000 },
      { label: "Delivery staff or partner cost", approxMonthly: 12_000 },
      { label: "Packaging", approxMonthly: 6_000 },
    ],
    variableCosts: [
      { label: "Raw ingredients", note: "Typically the largest single cost. Track it per meal, not per month, or you will not notice margin slipping." },
      { label: "Delivery per order", note: "Own delivery is cheaper at volume; aggregators cost more but bring discovery." },
    ],
    equipment: [
      "Commercial gas stove and cylinders",
      "Large cooking vessels and utensils",
      "Refrigerator and cold storage",
      "Insulated tiffin carriers or food containers",
      "Weighing scale",
      "Packaging and sealing equipment",
    ],
    licenses: [
      { name: "FSSAI registration or licence", authority: "Food Safety and Standards Authority of India", note: "Basic registration for small turnover; a State licence above the prescribed threshold. Confirm your category on the FSSAI portal." },
      { name: "GST registration", authority: "GST Department", note: "Required above the turnover threshold, and often required earlier if you sell through aggregators." },
      { name: "Shop and Establishment registration", authority: "State labour department", note: "Requirements differ by state." },
      { name: "Trade licence", authority: "Local municipal corporation" },
    ],
    skills: ["Cooking at volume", "Menu planning and costing", "Basic accounting", "Customer service", "Hygiene and food safety"],
    suppliersNote:
      "Buy staples from a wholesale market rather than retail — the difference is most of your margin. Build a relationship with two vegetable suppliers so a single supplier's bad day isn't your bad day.",
    marketingPlan: [
      "Free trial meals to offices and hostels within your delivery radius",
      "WhatsApp Business catalogue and a broadcast list for the daily menu",
      "Google Business Profile so you appear in local searches",
      "A referral discount — this is how tiffin services actually grow",
      "Listing on delivery aggregators once your kitchen can handle the volume",
    ],
    pricingModel:
      "Monthly subscription (typically 26 meals) with a per-meal option at a premium. Price from your costed plate, not from what the competitor charges.",
    revenueModel: "Recurring monthly subscriptions, plus one-off orders and occasional bulk catering.",
    breakEven: {
      assumptions: [
        "Fixed monthly costs, including any rent and delivery staff",
        "Contribution per meal = price charged minus ingredient and packaging cost",
        "Subscriber churn of 10–20% a month is normal and must be replaced",
      ],
      formula: "Meals needed per month = Total fixed costs ÷ (Price per meal − Variable cost per meal)",
      note:
        "Cost one plate accurately before you set a price. Most tiffin services that fail were underpricing from day one and only discovered it at scale. This is a calculation, not a projection — it tells you the volume you need, not the volume you will get.",
    },
    risks: [
      "Food safety incidents can end the business and carry legal liability.",
      "Subscriber churn is high; retention work never stops.",
      "Ingredient price volatility compresses margin without warning.",
      "It is physically demanding, seven days a week, with early starts.",
      "Aggregator commissions can consume most of the margin on non-subscription orders.",
    ],
    competition:
      "Crowded in every Indian city, but highly local — you compete with the three or four kitchens serving your radius, not the whole market. Consistency of taste and reliability of delivery time beat variety.",
    growth: [
      "Add corporate bulk contracts, which are steadier than individual subscribers",
      "Add weekend and festival special menus at higher margin",
      "Expand delivery radius once the kitchen has spare capacity",
      "Move to a cloud kitchen model with multiple cuisine brands",
    ],
    aiOpportunities: [
      "Forecast daily demand from subscription and historical data to cut food waste",
      "Automate WhatsApp menu broadcasts and order confirmations",
      "Optimise delivery routes for your own delivery staff",
    ],
    launchPlan: [
      {
        window: "Days 1–30",
        tasks: [
          "Cost a full week's menu down to the plate, including gas and packaging",
          "Apply for FSSAI registration and check your state's Shop and Establishment requirement",
          "Cook for 10 trial customers at cost and collect honest feedback",
          "Set up a WhatsApp Business account and a Google Business Profile",
        ],
      },
      {
        window: "Days 31–60",
        tasks: [
          "Convert trial customers to paid monthly subscriptions",
          "Fix your delivery process and timing before adding volume",
          "Reach 25–30 subscribers",
          "Start tracking daily ingredient cost per meal against your assumption",
        ],
      },
      {
        window: "Days 61–90",
        tasks: [
          "Introduce a referral discount and measure whether it actually converts",
          "Approach two or three small offices about bulk lunch contracts",
          "Review your break-even calculation against three months of real numbers",
          "Decide on aggregator listing based on whether your margin can absorb the commission",
        ],
      },
    ],
  },
  {
    slug: "digital-marketing-agency-in",
    name: "Digital Marketing Agency (Solo or Small Team)",
    category: "digital",
    targetCustomer:
      "Local businesses, clinics, coaching centres and small e-commerce sellers who need online presence but cannot afford a full agency retainer.",
    summary:
      "Sell campaign management, SEO and content to small local businesses. The lowest-capital business in this list — you need a laptop, an internet connection and one client willing to let you prove it works.",
    startupCost: [10_000, 75_000],
    fixedCosts: [
      { label: "Internet and phone", approxMonthly: 1_500 },
      { label: "Software subscriptions", approxMonthly: 3_000 },
      { label: "Co-working desk (optional)", approxMonthly: 6_000 },
    ],
    variableCosts: [
      { label: "Ad spend", note: "Usually billed to the client directly. Never fund a client's ad spend from your own account." },
      { label: "Freelance content or design", note: "Only as client work requires it." },
    ],
    equipment: ["Laptop", "Reliable internet connection", "Design and analytics software subscriptions"],
    licenses: [
      { name: "Udyam registration (MSME)", authority: "Ministry of MSME", note: "Free, and useful for opening a current account and accessing MSME schemes." },
      { name: "GST registration", authority: "GST Department", note: "Required above the turnover threshold, and generally expected by corporate clients." },
      { name: "Professional tax registration", authority: "State tax department", note: "Applicable in some states." },
    ],
    skills: ["Google Ads and Meta Ads", "SEO", "Content writing", "Analytics and reporting", "Client communication", "Sales"],
    suppliersNote:
      "You are the supplier. Build a reliable bench of two freelance designers and one writer before you need them, not during a deadline.",
    marketingPlan: [
      "Do one local business's marketing free for a month in exchange for a documented case study",
      "Cold outreach to businesses whose Google Business Profiles are visibly neglected",
      "Publish your own results publicly — proof beats a pitch deck",
      "Ask every client for one referral at the three-month mark",
    ],
    pricingModel:
      "Monthly retainer per service bundle, with ad spend billed separately and transparently. Avoid percentage-of-spend pricing early — it aligns you with spending more, not performing better.",
    revenueModel: "Recurring monthly retainers, with project fees for one-off website or campaign builds.",
    breakEven: {
      assumptions: [
        "Fixed monthly costs are low — often under ₹10,000 for a solo operator",
        "Each retainer client contributes their full fee minus any freelance cost",
        "Assume you can service 4–6 clients well as a solo operator, not 15",
      ],
      formula: "Clients needed = (Fixed costs + your target monthly income) ÷ Average retainer per client",
      note:
        "This business breaks even quickly. The real constraint is not cost, it is how many clients one person can serve without the quality dropping and the referrals stopping.",
    },
    risks: [
      "Client concentration — losing one of four clients is a 25% revenue drop.",
      "Payment delays from small businesses are common. Ask for advance or milestone payment.",
      "Platform algorithm changes can undo results you were being paid for.",
      "AI tooling is compressing what clients will pay for routine content and campaign work.",
      "Clients often expect sales results you cannot control, so set expectations in writing.",
    ],
    competition:
      "Very crowded, but most competitors are generalists. Specialising in one industry — dental clinics, coaching centres, real estate — makes your pitch concrete and your work reusable.",
    growth: [
      "Specialise in one vertical and become the obvious choice in it",
      "Add a productised service with fixed scope and price",
      "Hire your first employee only when you are consistently turning work away",
      "Move up-market to fewer, larger retainers rather than more small ones",
    ],
    aiOpportunities: [
      "Use AI for first-draft content and creative variations, with human editing before anything ships",
      "Automate reporting so clients get a weekly summary without your time",
      "Build client-facing dashboards that pull from ad platform APIs",
    ],
    launchPlan: [
      {
        window: "Days 1–30",
        tasks: [
          "Complete free Google Ads and Google Analytics certifications",
          "Pick one industry to specialise in",
          "Find one business to work with free for a month in exchange for a case study",
          "Register on Udyam and open a separate current account",
        ],
      },
      {
        window: "Days 31–60",
        tasks: [
          "Document the free client's results honestly, including what didn't work",
          "Approach 30 similar businesses with that case study",
          "Convert two to paid retainers",
          "Write a one-page service agreement covering scope, payment terms and what you don't guarantee",
        ],
      },
      {
        window: "Days 61–90",
        tasks: [
          "Reach four paying retainer clients",
          "Systematise reporting so it takes an hour a week, not a day",
          "Raise your rate for new clients once you have three case studies",
        ],
      },
    ],
  },
  {
    slug: "grocery-kirana-store-in",
    name: "Neighbourhood Kirana Store",
    category: "retail",
    targetCustomer: "Households within a 500m–1km radius, buying daily and weekly essentials.",
    summary:
      "The most familiar small business in India, and still viable — but only with tight inventory discipline. Margins are thin, working capital is everything, and location decides most of the outcome before you open.",
    startupCost: [2_00_000, 10_00_000],
    fixedCosts: [
      { label: "Shop rent", approxMonthly: 15_000 },
      { label: "Electricity", approxMonthly: 4_000 },
      { label: "Staff (one assistant)", approxMonthly: 12_000 },
    ],
    variableCosts: [
      { label: "Stock purchase", note: "The bulk of your capital. Fast-moving goods only until you know your demand pattern." },
      { label: "Delivery cost", note: "If you offer home delivery, which increasingly you must." },
    ],
    equipment: ["Shelving and display racks", "Weighing scale (verified)", "Billing system or POS", "Refrigerator for dairy and cold drinks", "CCTV"],
    licenses: [
      { name: "Shop and Establishment registration", authority: "State labour department" },
      { name: "FSSAI registration", authority: "FSSAI", note: "Required for selling packaged food items." },
      { name: "GST registration", authority: "GST Department", note: "Required above the turnover threshold." },
      { name: "Weights and Measures verification", authority: "State Legal Metrology department", note: "Your weighing scale must be verified and stamped." },
      { name: "Trade licence", authority: "Local municipal corporation" },
    ],
    skills: ["Inventory management", "Basic accounting", "Customer relationships", "Negotiation with distributors", "Cash flow management"],
    suppliersNote:
      "Register directly with FMCG distributors rather than buying from a wholesaler where you can — the margin difference is significant. Credit terms from distributors are the working capital that makes this business function.",
    marketingPlan: [
      "Home delivery within your radius — this is now the main differentiator against larger stores",
      "A WhatsApp order group for regular customers",
      "Google Business Profile so you appear in 'kirana near me' searches",
      "A simple loyalty record for regulars; retention is everything at this margin",
    ],
    pricingModel: "MRP-based with margins set by the distributor, typically thin on staples and better on impulse and non-food items.",
    revenueModel: "Daily retail sales, with a growing share from phone and WhatsApp orders with delivery.",
    breakEven: {
      assumptions: [
        "Gross margin on grocery is typically low single digits to low teens depending on the mix",
        "Fixed costs including rent, staff and electricity",
        "Stock turnover rate determines whether your capital works or sits on a shelf",
      ],
      formula: "Monthly sales needed = Fixed costs ÷ Average gross margin percentage",
      note:
        "At a low margin, small fixed costs demand large sales. Work this out before you sign a lease — rent is the variable that most often makes a kirana unviable, and it is the one you fix first and can change last.",
    },
    risks: [
      "Quick-commerce apps have taken meaningful share in metros.",
      "Working capital tied up in slow-moving stock is the most common failure mode.",
      "Credit sales to neighbours are hard to refuse and hard to recover.",
      "Perishables spoil; expiry management is a daily discipline.",
      "Location is close to irreversible once you have signed a lease.",
    ],
    competition:
      "Other kiranas, supermarkets and quick-commerce apps. Your advantages are credit for trusted regulars, immediate availability, and knowing your customers by name — none of which an app replicates.",
    growth: [
      "Add home delivery and phone ordering properly, not as an afterthought",
      "Expand into higher-margin categories: cosmetics, stationery, general merchandise",
      "Join a retail network or franchise for better purchase terms",
      "Add a second location only after the first runs without you",
    ],
    aiOpportunities: [
      "Demand forecasting to reduce dead stock and stockouts",
      "Automated reorder alerts based on sales velocity",
      "WhatsApp ordering with automated confirmation",
    ],
    launchPlan: [
      {
        window: "Days 1–30",
        tasks: [
          "Survey your intended location at different times of day and count footfall yourself",
          "Negotiate the lease hard — rent determines viability more than any other decision",
          "Register with three or four FMCG distributors",
          "Apply for Shop and Establishment, FSSAI and trade licences",
        ],
      },
      {
        window: "Days 31–60",
        tasks: [
          "Stock only fast-moving essentials for the first two months",
          "Set up billing software from day one so you have sales data, not guesses",
          "Introduce yourself to every household within 500m",
          "Start a WhatsApp order group",
        ],
      },
      {
        window: "Days 61–90",
        tasks: [
          "Review which items actually sold and drop the ones that didn't",
          "Add home delivery within your radius",
          "Compute your real gross margin from three months of data and compare it to your assumption",
        ],
      },
    ],
  },
  {
    slug: "coaching-centre-in",
    name: "Local Coaching or Tuition Centre",
    category: "education",
    targetCustomer: "School students in Classes 8–12 in your locality, and their parents.",
    summary:
      "Teach what you know well to students near you. Very low startup cost if you begin at home, revenue is recurring, and results — not marketing — drive growth after the first batch.",
    startupCost: [15_000, 3_00_000],
    fixedCosts: [
      { label: "Space rent (if not home-based)", approxMonthly: 10_000 },
      { label: "Electricity and internet", approxMonthly: 3_000 },
      { label: "Additional teaching staff", approxMonthly: 15_000 },
    ],
    variableCosts: [
      { label: "Study material printing", note: "Per student per term." },
      { label: "Test paper printing and assessment", note: "Scales with batch size." },
    ],
    equipment: ["Whiteboard or blackboard", "Seating for students", "Projector (optional)", "Printer for test papers", "Fans and adequate lighting"],
    licenses: [
      { name: "Shop and Establishment registration", authority: "State labour department" },
      { name: "GST registration", authority: "GST Department", note: "Coaching services attract GST above the turnover threshold. Confirm applicability for your turnover." },
      { name: "Trade licence", authority: "Local municipal corporation", note: "Requirements for coaching centres vary by city; some have specific safety and space norms." },
      { name: "Fire safety clearance", authority: "State fire department", note: "Increasingly required for centres above a certain size, and worth doing regardless." },
    ],
    skills: ["Subject expertise", "Teaching and explanation", "Student and parent communication", "Batch and time management", "Basic accounting"],
    suppliersNote:
      "Write your own material rather than buying generic sets. Material tailored to your local board's paper pattern is a genuine differentiator and costs only your time.",
    marketingPlan: [
      "A free demo class — this converts better than any advertisement",
      "Results of your first batch, published honestly, including how many students you had",
      "Word of mouth through parents, which is how this business actually grows",
      "Local WhatsApp groups and a Google Business Profile",
      "Pamphlets near schools at admission time",
    ],
    pricingModel: "Monthly fee per subject, with a discount for multi-subject or full-year enrolment.",
    revenueModel: "Recurring monthly fees, plus crash courses and test series around board examinations.",
    breakEven: {
      assumptions: [
        "Fixed costs including rent and any salaried teachers",
        "Fee per student per month",
        "A realistic batch size for your space — overcrowding costs you results, and results are the product",
      ],
      formula: "Students needed = Fixed costs ÷ Monthly fee per student",
      note:
        "Starting at home makes fixed costs almost zero, which means you break even with a handful of students. Take space only when demand has already outgrown your home.",
    },
    risks: [
      "Your reputation rests on student results, which you influence but do not control.",
      "Highly seasonal — enrolment concentrates around the academic year start.",
      "Online coaching platforms compete on price and convenience.",
      "Regulatory scrutiny of coaching centres has increased; safety norms are being enforced more seriously.",
      "Dependence on you personally makes it hard to scale or take a break.",
    ],
    competition:
      "Every locality has coaching centres. The differentiators that actually work are small batch sizes, individual attention, and being honest with parents about what their child needs.",
    growth: [
      "Add subjects by bringing in specialist teachers",
      "Add a test series product, which has high margin and low delivery cost",
      "Record lessons for a hybrid offering",
      "Open a second batch timing before opening a second location",
    ],
    aiOpportunities: [
      "Generate practice questions and variations at the right difficulty",
      "Automate test evaluation for objective papers",
      "Track individual student weak areas across tests and flag them to parents",
    ],
    launchPlan: [
      {
        window: "Days 1–30",
        tasks: [
          "Choose the two subjects and classes you can genuinely teach better than the local alternative",
          "Start at home with a batch of five students",
          "Prepare your own material for the first term",
          "Set clear fee terms in writing before the first class",
        ],
      },
      {
        window: "Days 31–60",
        tasks: [
          "Run weekly tests and share results with parents",
          "Collect honest feedback from students and act on it visibly",
          "Grow to 15 students through referrals from the first batch",
        ],
      },
      {
        window: "Days 61–90",
        tasks: [
          "Assess whether you need rented space or whether home still works",
          "Add a second batch timing if demand supports it",
          "Publish your first batch results honestly, with the numbers alongside them",
        ],
      },
    ],
  },
  {
    slug: "goods-transport-in",
    name: "Small Goods Transport Business",
    category: "transport",
    targetCustomer: "Local businesses, e-commerce sellers, wholesalers and households needing goods moved within a city or between nearby cities.",
    summary:
      "Own one commercial vehicle and move goods for others. Capital-intensive relative to service businesses, but the asset holds value and demand from e-commerce has been steady.",
    startupCost: [3_00_000, 15_00_000],
    fixedCosts: [
      { label: "Vehicle loan EMI", approxMonthly: 18_000 },
      { label: "Insurance", approxMonthly: 3_000 },
      { label: "Driver salary (if not driving yourself)", approxMonthly: 18_000 },
      { label: "Parking", approxMonthly: 2_000 },
    ],
    variableCosts: [
      { label: "Fuel", note: "The single largest variable. Track cost per kilometre, not per tank." },
      { label: "Maintenance and tyres", note: "Set aside a monthly amount even in months you don't spend it." },
      { label: "Tolls and permits", note: "Varies by route." },
    ],
    equipment: ["Commercial vehicle (LCV or mini truck)", "GPS tracking", "Loading equipment and straps", "Tarpaulin"],
    licenses: [
      { name: "Commercial driving licence", authority: "State Regional Transport Office", note: "Required for the driver, whether that is you or an employee." },
      { name: "Vehicle registration as commercial", authority: "State RTO" },
      { name: "National or state permit", authority: "State Transport Department", note: "Depends on whether you operate within one state or across state lines." },
      { name: "Fitness certificate", authority: "State RTO", note: "Renewed periodically." },
      { name: "GST registration", authority: "GST Department", note: "Goods transport has specific GST treatment; take professional advice on reverse charge applicability." },
      { name: "Udyam registration", authority: "Ministry of MSME", note: "Free; useful for financing." },
    ],
    skills: ["Driving and vehicle knowledge", "Route planning", "Basic accounting", "Client relationships", "Negotiation"],
    suppliersNote:
      "Your suppliers are fuel and maintenance. Fixed relationships with one fuel station and one mechanic give you credit terms and faster turnaround when a breakdown costs you a day's revenue.",
    marketingPlan: [
      "Register on load-matching apps and freight aggregator platforms",
      "Direct relationships with two or three wholesalers who ship regularly",
      "Approach local e-commerce sellers and warehouses",
      "Reliability is the marketing — the same three clients calling every week beats fifty one-off jobs",
    ],
    pricingModel: "Per trip based on distance and load, or a monthly contract rate for regular clients. Contract rates are lower per trip but remove the uncertainty.",
    revenueModel: "Per-trip charges, with monthly contracts providing a stable base.",
    breakEven: {
      assumptions: [
        "Fixed monthly costs including EMI, insurance and driver salary",
        "Revenue per trip minus fuel and running cost per trip",
        "Realistic utilisation — a vehicle idle three days a week still owes its EMI",
      ],
      formula: "Trips needed per month = Fixed costs ÷ (Revenue per trip − Variable cost per trip)",
      note:
        "Utilisation is what makes or breaks this business. Work out how many trips you need at realistic rates before taking the loan, and be honest about how many days a month the vehicle will actually be earning.",
    },
    risks: [
      "Vehicle breakdown stops revenue entirely while costs continue.",
      "Fuel price volatility hits margin directly and quickly.",
      "The EMI is fixed whether the vehicle works or not — this is the core risk.",
      "Accident liability and driver dependability are real operational risks.",
      "Payment delays from business clients are common; agree terms in writing.",
    ],
    competition:
      "Fragmented and price-competitive. Reliability, on-time delivery and careful handling win repeat contracts, which is where the stable money is.",
    growth: [
      "Add a second vehicle only once the first has steady contracted work",
      "Move from spot trips to monthly contracts for predictable revenue",
      "Specialise — refrigerated transport or fragile goods command better rates",
      "Add small warehousing if you have space",
    ],
    aiOpportunities: [
      "Route optimisation to cut fuel cost per trip",
      "Load matching to reduce empty return journeys, which is where margin leaks",
      "Predictive maintenance scheduling from mileage and usage data",
    ],
    launchPlan: [
      {
        window: "Days 1–30",
        tasks: [
          "Work out your cost per kilometre before choosing a vehicle",
          "Compare loan terms from at least three lenders, including MSME schemes",
          "Complete registration, permit and insurance",
          "Line up two potential regular clients before the vehicle arrives",
        ],
      },
      {
        window: "Days 31–60",
        tasks: [
          "Register on freight aggregator platforms",
          "Track every trip's revenue and fuel cost in a simple sheet",
          "Convert at least one client to a monthly contract",
        ],
      },
      {
        window: "Days 61–90",
        tasks: [
          "Compare actual cost per kilometre against your original assumption",
          "Reduce empty return trips by finding return loads",
          "Build a maintenance reserve from every trip's revenue",
        ],
      },
    ],
  },
  {
    slug: "electrical-plumbing-services-in",
    name: "Electrical & Plumbing Service Business",
    category: "services",
    targetCustomer: "Households, small offices, builders and property managers needing installation, repair and maintenance.",
    summary:
      "Turn a trade skill into a business. Very low capital, immediate demand in every locality, and one of the few businesses where you can start earning in week one with tools you may already own.",
    startupCost: [20_000, 2_00_000],
    fixedCosts: [
      { label: "Phone and internet", approxMonthly: 1_000 },
      { label: "Transport (two-wheeler fuel)", approxMonthly: 3_000 },
      { label: "Small workshop or storage (optional)", approxMonthly: 5_000 },
    ],
    variableCosts: [
      { label: "Materials", note: "Usually billed to the customer on top of labour, or included in a quoted job price." },
      { label: "Helper wages", note: "Per job, once you take on work needing two people." },
    ],
    equipment: ["Professional tool kit", "Testing instruments", "Safety equipment", "Two-wheeler for callouts", "Basic inventory of common fittings"],
    licenses: [
      { name: "Electrical contractor licence", authority: "State Electrical Licensing Board", note: "Required for electrical contracting work. Requirements differ by state." },
      { name: "Udyam registration", authority: "Ministry of MSME", note: "Free, and useful for a current account and MSME schemes." },
      { name: "GST registration", authority: "GST Department", note: "Required above the turnover threshold; often expected by builder and corporate clients." },
      { name: "Shop and Establishment registration", authority: "State labour department", note: "If you take premises." },
    ],
    skills: ["Trade skill (ITI level or equivalent)", "Fault diagnosis", "Quoting and estimation", "Customer communication", "Basic accounting"],
    suppliersNote:
      "Open accounts with two hardware and electrical suppliers for credit terms and better rates. Carry a small stock of the fittings you use weekly — a second trip to the shop costs you more than the stock does.",
    marketingPlan: [
      "Google Business Profile with photos of completed work and genuine reviews — most emergency callouts start with a local search",
      "Register on home-services platforms for initial volume",
      "Build relationships with two or three builders and property managers for repeat work",
      "Ask every satisfied customer to save your number and pass it on",
    ],
    pricingModel: "Per-job quotes for defined work, hourly for diagnostics, and annual maintenance contracts for offices and buildings.",
    revenueModel: "Job-based income, with annual maintenance contracts providing a predictable base.",
    breakEven: {
      assumptions: [
        "Fixed costs are very low — often under ₹10,000 a month",
        "Contribution per job = amount charged minus material and helper cost",
        "A realistic number of jobs per day, allowing for travel time",
      ],
      formula: "Jobs needed per month = (Fixed costs + target income) ÷ Average contribution per job",
      note:
        "Break-even here is almost immediate because fixed costs are so low. The real constraint is how many jobs you can physically reach in a day, which makes travel time your hidden cost.",
    },
    risks: [
      "Income stops entirely if you are ill or injured — this is a one-person dependency.",
      "Electrical work carries genuine safety and liability risk.",
      "Seasonal fluctuation in demand.",
      "Platform commissions on home-services apps are significant.",
      "Customers who dispute a quote after the work is done — always quote in writing.",
    ],
    competition:
      "Fragmented and highly local. Reliability, turning up when you said you would, and clean work are what generate the referrals this business runs on.",
    growth: [
      "Hire and train a helper, then a second tradesperson",
      "Add annual maintenance contracts with apartment associations and offices",
      "Expand from repair into installation projects for builders, which are larger jobs",
      "Add adjacent trades — an electrician who can also handle basic plumbing gets more of each job",
    ],
    aiOpportunities: [
      "Automated appointment booking and reminders over WhatsApp",
      "A quoting tool that produces consistent written estimates in minutes",
      "Job scheduling that accounts for travel time between callouts",
    ],
    launchPlan: [
      {
        window: "Days 1–30",
        tasks: [
          "Confirm your state's electrical contractor licence requirement and apply",
          "Assemble a professional tool kit and safety equipment",
          "Register on Udyam and open a separate current account",
          "Set up a Google Business Profile with real photos of your work",
        ],
      },
      {
        window: "Days 31–60",
        tasks: [
          "Register on two home-services platforms for initial job flow",
          "Complete 20 jobs and ask every customer for a review",
          "Standardise your written quote format",
        ],
      },
      {
        window: "Days 61–90",
        tasks: [
          "Approach three apartment associations about annual maintenance contracts",
          "Track which channel your jobs actually come from and stop paying for the ones that don't work",
          "Consider taking on a helper if you are turning work away",
        ],
      },
    ],
  },
];
