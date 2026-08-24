/**
 * UI string catalogue.
 *
 * English is the source of truth and its object shape defines the key set —
 * `Messages` is derived from it, so a Hindi catalogue missing a key is a type
 * error rather than a blank space on a page in production.
 *
 * Content held in the database (career summaries, exam eligibility rules) is
 * NOT translated here. That lives in the `translations` table with a
 * provenance label, because a machine-translated eligibility rule presented as
 * authoritative is precisely the failure this product exists to prevent.
 */

export const en = {
  common: {
    signIn: "Sign in",
    signUp: "Create account",
    signOut: "Sign out",
    dashboard: "Dashboard",
    search: "Search",
    seeAll: "See all",
    back: "Back",
    save: "Save",
    cancel: "Cancel",
    submit: "Submit",
    loading: "Loading…",
    none: "Nothing here yet.",
    required: "Required",
    optional: "Optional",
    estimate: "Estimate",
    verified: "Verified",
    unverified: "Unverified",
    aiJudgement: "AI judgement",
    paidPromotion: "Paid promotion",
    language: "Language",
  },
  nav: {
    careers: "Careers",
    exams: "Government exams",
    jobs: "Jobs",
    courses: "Courses",
    mentors: "Mentors",
    business: "Business",
    pathways: "Pathways",
    assistant: "Assistant",
    pricing: "Pricing",
    notifications: "Notifications",
    billing: "Billing",
  },
  home: {
    heroTitle: "Work out what to do next",
    heroSubtitle:
      "Careers, government exams, jobs and business ideas — with the sources shown and the guesses labelled.",
    highDemand: "High-demand right now",
    governmentExams: "Government exams",
    startAssessment: "Take the assessment",
  },
  courses: {
    title: "Courses and coaching",
    subtitle: "Find a course or coaching centre, with claims labelled for what they are.",
    searchPlaceholder: "Search courses, coaching centres, exams…",
    mode: "Mode",
    fee: "Fee",
    batches: "Batches",
    provider: "Provider",
    enquire: "Ask for details",
    enquirySent: "Your enquiry has been sent.",
    claimedBy: "Claimed by the provider",
    noClaimsVerified: "We have not checked this figure against an independent source.",
    feeNote: "Fees change. Confirm with the provider before paying anything.",
  },
  mentors: {
    title: "Mentors",
    subtitle: "People who have done the thing you're trying to do.",
    bookSession: "Request a session",
    experience: "Experience",
    languages: "Languages",
    rate: "Rate",
    free: "Free",
    becomeMentor: "Become a mentor",
    credentialsVerified: "Credentials verified",
    requestSent: "Your request has been sent to the mentor.",
  },
  billing: {
    title: "Plans and billing",
    currentPlan: "Current plan",
    upgrade: "Upgrade",
    cancel: "Cancel plan",
    resume: "Resume plan",
    history: "Payment history",
    renewsOn: "Renews on",
    accessUntil: "Access until",
    paymentsUnavailable:
      "Card payment isn't switched on for this deployment, so paid plans can't be bought here yet.",
  },
  notifications: {
    title: "Notifications",
    markAllRead: "Mark all as read",
    empty: "Nothing to catch up on.",
    preferences: "Notification preferences",
    channelUnavailable: "Not available on this deployment",
  },
  employer: {
    title: "Hiring",
    postJob: "Post a job",
    myPostings: "Your postings",
    applicants: "Applicants",
    orgUnverified:
      "Your organisation is not verified yet, so postings stay in draft. Verification is usually a same-day check.",
    submittedForReview: "Submitted. A reviewer will look at this before it goes live.",
  },
  b2b: {
    title: "Institution dashboard",
    cohorts: "Cohorts",
    members: "Students",
    invite: "Invite students",
    analytics: "Cohort insight",
    privacyFloor:
      "Figures appear once a cohort has enough consented students that no individual can be identified.",
  },
};

/**
 * Derived from the English catalogue, so adding a key there makes every other
 * catalogue fail to compile until it is translated. Note the absence of
 * `as const` above: values widen to `string`, which is what lets a Hindi
 * catalogue satisfy the same type while the key set stays fixed.
 */
export type Messages = typeof en;

/**
 * Hindi catalogue.
 *
 * Translated for meaning, not word-for-word: `heroSubtitle` in particular
 * keeps the promise ("sources shown, guesses labelled") rather than the
 * English sentence structure.
 */
export const hi: Messages = {
  common: {
    signIn: "साइन इन करें",
    signUp: "खाता बनाएँ",
    signOut: "साइन आउट",
    dashboard: "डैशबोर्ड",
    search: "खोजें",
    seeAll: "सभी देखें",
    back: "वापस",
    save: "सहेजें",
    cancel: "रद्द करें",
    submit: "भेजें",
    loading: "लोड हो रहा है…",
    none: "अभी यहाँ कुछ नहीं है।",
    required: "आवश्यक",
    optional: "वैकल्पिक",
    estimate: "अनुमान",
    verified: "सत्यापित",
    unverified: "असत्यापित",
    aiJudgement: "AI का आकलन",
    paidPromotion: "प्रायोजित",
    language: "भाषा",
  },
  nav: {
    careers: "करियर",
    exams: "सरकारी परीक्षाएँ",
    jobs: "नौकरियाँ",
    courses: "कोर्स",
    mentors: "मेंटर",
    business: "व्यवसाय",
    pathways: "आगे के रास्ते",
    assistant: "सहायक",
    pricing: "मूल्य",
    notifications: "सूचनाएँ",
    billing: "भुगतान",
  },
  home: {
    heroTitle: "आगे क्या करना है, तय कीजिए",
    heroSubtitle:
      "करियर, सरकारी परीक्षाएँ, नौकरियाँ और व्यवसाय के विकल्प — हर जानकारी के स्रोत के साथ, और अनुमान को अनुमान बताकर।",
    highDemand: "अभी सबसे ज़्यादा माँग",
    governmentExams: "सरकारी परीक्षाएँ",
    startAssessment: "आकलन शुरू करें",
  },
  courses: {
    title: "कोर्स और कोचिंग",
    subtitle: "कोर्स या कोचिंग संस्थान खोजें — हर दावे पर साफ़ लेबल के साथ।",
    searchPlaceholder: "कोर्स, कोचिंग संस्थान, परीक्षा खोजें…",
    mode: "माध्यम",
    fee: "शुल्क",
    batches: "बैच",
    provider: "संस्थान",
    enquire: "जानकारी माँगें",
    enquirySent: "आपका सवाल भेज दिया गया है।",
    claimedBy: "संस्थान का दावा",
    noClaimsVerified: "हमने इस आँकड़े की स्वतंत्र रूप से जाँच नहीं की है।",
    feeNote: "शुल्क बदलते रहते हैं। भुगतान से पहले संस्थान से पुष्टि कर लें।",
  },
  mentors: {
    title: "मेंटर",
    subtitle: "वे लोग जो वह रास्ता पहले तय कर चुके हैं।",
    bookSession: "सत्र के लिए अनुरोध करें",
    experience: "अनुभव",
    languages: "भाषाएँ",
    rate: "शुल्क",
    free: "निःशुल्क",
    becomeMentor: "मेंटर बनें",
    credentialsVerified: "प्रमाण सत्यापित",
    requestSent: "आपका अनुरोध मेंटर को भेज दिया गया है।",
  },
  billing: {
    title: "योजनाएँ और भुगतान",
    currentPlan: "मौजूदा योजना",
    upgrade: "अपग्रेड करें",
    cancel: "योजना रद्द करें",
    resume: "योजना फिर शुरू करें",
    history: "भुगतान का इतिहास",
    renewsOn: "नवीनीकरण",
    accessUntil: "इस तारीख़ तक पहुँच",
    paymentsUnavailable:
      "इस इंस्टॉलेशन पर कार्ड भुगतान चालू नहीं है, इसलिए अभी सशुल्क योजनाएँ यहाँ नहीं ख़रीदी जा सकतीं।",
  },
  notifications: {
    title: "सूचनाएँ",
    markAllRead: "सभी पढ़ी हुई मार्क करें",
    empty: "कुछ नया नहीं है।",
    preferences: "सूचना सेटिंग्स",
    channelUnavailable: "इस इंस्टॉलेशन पर उपलब्ध नहीं",
  },
  employer: {
    title: "भर्ती",
    postJob: "नौकरी पोस्ट करें",
    myPostings: "आपकी पोस्टिंग",
    applicants: "आवेदक",
    orgUnverified:
      "आपका संगठन अभी सत्यापित नहीं है, इसलिए पोस्टिंग ड्राफ़्ट में रहेंगी। सत्यापन आमतौर पर उसी दिन हो जाता है।",
    submittedForReview: "भेज दिया गया। लाइव होने से पहले समीक्षक इसे देखेंगे।",
  },
  b2b: {
    title: "संस्थान डैशबोर्ड",
    cohorts: "बैच",
    members: "विद्यार्थी",
    invite: "विद्यार्थियों को आमंत्रित करें",
    analytics: "बैच विश्लेषण",
    privacyFloor:
      "आँकड़े तभी दिखते हैं जब बैच में इतने सहमत विद्यार्थी हों कि किसी एक की पहचान न हो सके।",
  },
};

export const CATALOGUES = { en, hi } as const;
