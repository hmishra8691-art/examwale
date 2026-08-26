"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Callout, Card, cx, SectionHeading } from "@/components/ui";
import type { FullProfile } from "@/modules/users/service";

const EMPLOYMENT = [
  { value: "student", label: "Studying" },
  { value: "employed", label: "Employed" },
  { value: "unemployed", label: "Looking for work" },
  { value: "self_employed", label: "Self-employed" },
  { value: "career_break", label: "On a career break" },
];

export function ProfileForm({
  profile,
  regions,
  stages,
  skillSuggestions,
  interestOptions,
  countryIso,
}: {
  profile: FullProfile;
  regions: string[];
  /** The country this page resolved to — saved with the profile so the user's
   *  stated home country matches the content they were actually looking at. */
  countryIso: string;
  stages: { slug: string; name: string }[];
  skillSuggestions: string[];
  interestOptions: { value: string; label: string }[];
}) {
  const router = useRouter();

  const [name, setName] = useState(profile.user.name ?? "");
  const [age, setAge] = useState(profile.profile?.age?.toString() ?? "");
  const [regionName, setRegionName] = useState(profile.regionName ?? "");
  const [city, setCity] = useState(profile.profile?.city ?? "");
  const [preferredLanguage, setPreferredLanguage] = useState(profile.profile?.preferredLanguage ?? "en");

  const [educationStageSlug, setEducationStageSlug] = useState(profile.stageSlug ?? "");
  const [degree, setDegree] = useState(profile.profile?.degree ?? "");
  const [major, setMajor] = useState(profile.profile?.major ?? "");
  const [institution, setInstitution] = useState(profile.profile?.institution ?? "");

  const [employmentStatus, setEmploymentStatus] = useState(profile.profile?.employmentStatus ?? "");
  const [yearsExperience, setYearsExperience] = useState(
    profile.profile?.yearsExperience?.toString() ?? "",
  );

  const [availableBudget, setAvailableBudget] = useState(
    profile.profile?.availableBudget?.toString() ?? "",
  );
  const [availableHoursPerDay, setAvailableHoursPerDay] = useState(
    profile.profile?.availableHoursPerDay?.toString() ?? "",
  );
  const [willingnessToRelocate, setWillingnessToRelocate] = useState(
    profile.profile?.willingnessToRelocate ?? false,
  );
  const [onlineOfflinePreference, setOnlineOfflinePreference] = useState(
    profile.profile?.onlineOfflinePreference ?? "either",
  );
  const [riskTolerance, setRiskTolerance] = useState(profile.profile?.riskTolerance ?? "medium");
  const [desiredIncomeMin, setDesiredIncomeMin] = useState(
    profile.profile?.desiredIncomeMin?.toString() ?? "",
  );

  const [interests, setInterests] = useState<string[]>(profile.interests);
  const [skills, setSkills] = useState<string[]>(
    profile.skills.filter((skill) => skill.source === "self_reported").map((skill) => skill.name),
  );
  const [skillInput, setSkillInput] = useState("");

  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extractedSkills = profile.skills.filter((skill) => skill.source === "ai_extracted");

  function addSkill(value: string) {
    const clean = value.trim();
    if (!clean || skills.includes(clean)) return;
    setSkills((current) => [...current, clean]);
    setSkillInput("");
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);

    const toNumber = (value: string) => (value.trim() === "" ? null : Number(value));

    try {
      const response = await fetch("/api/v1/users/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || undefined,
          age: toNumber(age),
          countryIso,
          regionName: regionName || null,
          city: city || null,
          preferredLanguage,
          educationStageSlug: educationStageSlug || null,
          degree: degree || null,
          major: major || null,
          institution: institution || null,
          employmentStatus: employmentStatus || null,
          yearsExperience: toNumber(yearsExperience),
          availableBudget: toNumber(availableBudget),
          availableHoursPerDay: toNumber(availableHoursPerDay),
          willingnessToRelocate,
          onlineOfflinePreference,
          riskTolerance,
          desiredIncomeMin: toNumber(desiredIncomeMin),
          interests,
          skills,
        }),
      });

      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? "Couldn't save those changes.");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500";
  const label = "mb-1 block text-sm font-medium";

  return (
    <form onSubmit={save} className="space-y-6">
      <section aria-labelledby="about-you">
        <SectionHeading title="About you" id="about-you" />
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="name" className={label}>Name</label>
              <input id="name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
            </div>
            <div>
              <label htmlFor="age" className={label}>Age</label>
              <input id="age" type="number" min={10} max={90} value={age} onChange={(e) => setAge(e.target.value)} className={field} />
            </div>
            <div>
              <label htmlFor="region" className={label}>State</label>
              <select id="region" value={regionName} onChange={(e) => setRegionName(e.target.value)} className={field}>
                <option value="">Select a state</option>
                {regions.map((region) => (
                  <option key={region} value={region}>{region}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="city" className={label}>City or town</label>
              <input id="city" value={city} onChange={(e) => setCity(e.target.value)} className={field} />
            </div>
            <div>
              <label htmlFor="language" className={label}>Preferred language</label>
              <select id="language" value={preferredLanguage} onChange={(e) => setPreferredLanguage(e.target.value)} className={field}>
                <option value="en">English</option>
                <option value="hi">हिन्दी (Hindi)</option>
              </select>
              <p className="mt-1 text-xs text-faint">
                Hindi content is planned; the interface is English-only for now.
              </p>
            </div>
          </div>
        </Card>
      </section>

      <section aria-labelledby="education">
        <SectionHeading title="Education" id="education" />
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="stage" className={label}>Where you are now</label>
              <select id="stage" value={educationStageSlug} onChange={(e) => setEducationStageSlug(e.target.value)} className={field}>
                <option value="">Select</option>
                {stages.map((stage) => (
                  <option key={stage.slug} value={stage.slug}>{stage.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="degree" className={label}>Degree or qualification</label>
              <input id="degree" value={degree} onChange={(e) => setDegree(e.target.value)} placeholder="e.g. B.Com, BTech, ITI Electrician" className={field} />
            </div>
            <div>
              <label htmlFor="major" className={label}>Subject or stream</label>
              <input id="major" value={major} onChange={(e) => setMajor(e.target.value)} placeholder="e.g. Commerce, Mechanical" className={field} />
            </div>
            <div>
              <label htmlFor="institution" className={label}>Institution</label>
              <input id="institution" value={institution} onChange={(e) => setInstitution(e.target.value)} className={field} />
            </div>
          </div>
        </Card>
      </section>

      <section aria-labelledby="work">
        <SectionHeading title="Work" id="work" />
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="employment" className={label}>Current status</label>
              <select id="employment" value={employmentStatus} onChange={(e) => setEmploymentStatus(e.target.value)} className={field}>
                <option value="">Select</option>
                {EMPLOYMENT.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="experience" className={label}>Years of work experience</label>
              <input id="experience" type="number" min={0} max={60} value={yearsExperience} onChange={(e) => setYearsExperience(e.target.value)} className={field} />
            </div>
          </div>
        </Card>
      </section>

      <section aria-labelledby="interests-section">
        <SectionHeading
          title="Interests"
          id="interests-section"
          description="What you find genuinely interesting. This carries the most weight in career scoring."
        />
        <Card>
          <ul className="flex flex-wrap gap-2">
            {interestOptions.map((option) => {
              const active = interests.includes(option.value);
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setInterests((current) =>
                        active ? current.filter((item) => item !== option.value) : [...current, option.value],
                      )
                    }
                    className={cx(
                      "rounded-full border px-3 py-1.5 text-sm transition-colors",
                      active ? "border-brand-500 bg-brand-500 text-white" : "hover:border-brand-400",
                    )}
                  >
                    {option.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      </section>

      <section aria-labelledby="skills-section">
        <SectionHeading title="Skills" id="skills-section" description="What you can already do. Used for job matching." />
        <Card>
          <div className="flex gap-2">
            <div className="flex-1">
              <label htmlFor="skill-input" className="sr-only">Add a skill</label>
              <input
                id="skill-input"
                list="skill-list"
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSkill(skillInput);
                  }
                }}
                placeholder="Type a skill and press Enter"
                className={field}
              />
              <datalist id="skill-list">
                {skillSuggestions.map((skill) => (
                  <option key={skill} value={skill} />
                ))}
              </datalist>
            </div>
            <Button type="button" variant="secondary" onClick={() => addSkill(skillInput)}>
              Add
            </Button>
          </div>

          {skills.length ? (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {skills.map((skill) => (
                <li key={skill}>
                  <button
                    type="button"
                    onClick={() => setSkills((current) => current.filter((item) => item !== skill))}
                    className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-700 hover:bg-brand-100 dark:bg-brand-900/40 dark:text-brand-100"
                  >
                    {skill}
                    <span aria-hidden>×</span>
                    <span className="sr-only">Remove {skill}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">No skills added yet.</p>
          )}

          {extractedSkills.length ? (
            <div className="mt-4 border-t pt-3">
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                Extracted from your documents
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {extractedSkills.map((skill) => (
                  <li key={skill.name}>
                    <Badge tone="neutral">{skill.name}</Badge>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-xs text-faint">
                These came from a document you confirmed. Manage them from the Documents page.
              </p>
            </div>
          ) : null}
        </Card>
      </section>

      <section aria-labelledby="constraints">
        <SectionHeading
          title="Your constraints"
          id="constraints"
          description="The most useful section on this page. A plan that ignores your budget and your available hours isn't a plan."
        />
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="budget" className={label}>Budget for education or training (₹)</label>
              <input id="budget" type="number" min={0} value={availableBudget} onChange={(e) => setAvailableBudget(e.target.value)} placeholder="e.g. 50000" className={field} />
              <p className="mt-1 text-xs text-faint">Total across the whole path, not per year.</p>
            </div>
            <div>
              <label htmlFor="hours" className={label}>Hours you can study per day</label>
              <input id="hours" type="number" min={0} max={18} step={0.5} value={availableHoursPerDay} onChange={(e) => setAvailableHoursPerDay(e.target.value)} placeholder="e.g. 3" className={field} />
            </div>
            <div>
              <label htmlFor="income" className={label}>Income you're aiming for (₹ per year)</label>
              <input id="income" type="number" min={0} value={desiredIncomeMin} onChange={(e) => setDesiredIncomeMin(e.target.value)} placeholder="e.g. 600000" className={field} />
            </div>
            <div>
              <label htmlFor="mode" className={label}>Learning preference</label>
              <select id="mode" value={onlineOfflinePreference} onChange={(e) => setOnlineOfflinePreference(e.target.value)} className={field}>
                <option value="either">Either works</option>
                <option value="online">Online</option>
                <option value="offline">In person</option>
              </select>
            </div>
            <div>
              <label htmlFor="risk" className={label}>Risk tolerance</label>
              <select id="risk" value={riskTolerance} onChange={(e) => setRiskTolerance(e.target.value)} className={field}>
                <option value="low">Low — I want a predictable path</option>
                <option value="medium">Medium</option>
                <option value="high">High — I'll take a competitive route</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={willingnessToRelocate}
                  onChange={(e) => setWillingnessToRelocate(e.target.checked)}
                  className="size-4 accent-brand-600"
                />
                I&rsquo;m willing to relocate for the right opportunity
              </label>
            </div>
          </div>
        </Card>
      </section>

      {error ? (
        <Callout tone="danger">
          <p>{error}</p>
        </Callout>
      ) : null}
      {saved ? (
        <Callout tone="good">
          <p>Saved. Your recommendations and job matches will use this from now on.</p>
        </Callout>
      ) : null}

      <div className="sticky bottom-4 flex justify-end">
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </form>
  );
}
