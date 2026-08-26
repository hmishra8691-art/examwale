import Link from "next/link";

const COLUMNS = [
  {
    heading: "Explore",
    links: [
      { href: "/careers", label: "Career guides" },
      { href: "/exams", label: "Government exams" },
      { href: "/jobs", label: "Jobs" },
      { href: "/business", label: "Business ideas" },
      { href: "/pathways", label: "After Class 10 & 12" },
    ],
  },
  {
    heading: "Guidance",
    links: [
      { href: "/guidance", label: "All guidance" },
      { href: "/mentors", label: "Find a mentor" },
      { href: "/guidance/resume", label: "Résumé report" },
      { href: "/guidance/interview", label: "Interview practice" },
      { href: "/guidance/matches", label: "What suits me" },
      { href: "/assessment", label: "Career assessment" },
    ],
  },
  {
    heading: "Account",
    links: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/dashboard/profile", label: "Your profile" },
      { href: "/signup", label: "Create an account" },
      { href: "/login", label: "Sign in" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t bg-[var(--surface-raised)]">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <span
                aria-hidden
                className="grid size-7 place-items-center rounded-lg bg-brand-600 text-xs font-bold text-white"
              >
                E
              </span>
              <span className="font-[family-name:var(--font-display)]">ExamWale</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-muted">
              Guidance for the whole journey — school, college, exams, work and starting something
              of your own. Built for India first.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">
                {column.heading}
              </h2>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-muted hover:text-[var(--text)]">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 border-t pt-6 text-xs text-faint">
          <p className="max-w-3xl">
            ExamWale gives guidance, not guarantees. Nothing here promises admission, employment, a
            salary, exam success or business profit. Eligibility rules, dates, fees and licensing
            requirements change — always confirm them against the official notification or the
            relevant authority before you act.
          </p>
          <p className="mt-3">© {new Date().getFullYear()} ExamWale.</p>
        </div>
      </div>
    </footer>
  );
}
