/**
 * Locale resolution and content translation.
 *
 * Two separate concerns live here on purpose:
 *
 *  - `getLocale` / `getMessages` serve *interface* strings, which ship with the
 *    build and are always complete because the type system says so.
 *  - `translateRecords` serves *content* strings out of the `translations`
 *    table, which is never complete, and must therefore say what it is showing.
 *
 * The second is the one with teeth. A machine-translated exam eligibility rule
 * that reads as fluent Hindi is more dangerous than the English original,
 * because a reader cannot tell it might be wrong. So content translation
 * returns the provenance alongside the string and falls back to the original
 * rather than guessing.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { translations } from "@/db/schema";
import { CATALOGUES, type Messages } from "@/modules/i18n/messages";
import { DEFAULT_LOCALE, LOCALE_COOKIE, coerceLocale, type Locale } from "@/modules/i18n/config";

/** Reads the locale cookie. Deduped per request. */
export const getLocale = cache(async (): Promise<Locale> => {
  try {
    const store = await cookies();
    return coerceLocale(store.get(LOCALE_COOKIE)?.value);
  } catch {
    // Called outside a request scope (a script, a background job).
    return DEFAULT_LOCALE;
  }
});

export const getMessages = cache(async (): Promise<Messages> => {
  const locale = await getLocale();
  return CATALOGUES[locale];
});

/** For client components and anywhere the locale is already known. */
export function messagesFor(locale: Locale): Messages {
  return CATALOGUES[locale] ?? CATALOGUES[DEFAULT_LOCALE];
}

export type TranslatedField = {
  value: string;
  /** True when `value` is the original, not a translation. */
  isOriginal: boolean;
  source: "HUMAN" | "MACHINE" | "MACHINE_REVIEWED" | null;
};

/**
 * Whether a translation should be shown without a caveat.
 *
 * HUMAN and MACHINE_REVIEWED have had a person's eyes on them. Raw MACHINE
 * output is shown — hiding it would leave a Hindi reader with nothing — but
 * the caller is told, so the UI can mark it.
 */
export function isTrustedTranslation(source: string | null): boolean {
  return source === "HUMAN" || source === "MACHINE_REVIEWED";
}

/**
 * Translates a set of fields for one entity.
 *
 * Returns the original for any field with no translation row, so a partially
 * translated record renders as mixed-language rather than as gaps.
 */
export async function translateEntity<T extends Record<string, string | null | undefined>>(
  entityType: string,
  entityId: string,
  fields: T,
  locale?: Locale,
): Promise<Record<keyof T, TranslatedField>> {
  const target = locale ?? (await getLocale());
  const keys = Object.keys(fields);

  const out = {} as Record<keyof T, TranslatedField>;
  for (const key of keys) {
    out[key as keyof T] = {
      value: fields[key] ?? "",
      isOriginal: true,
      source: null,
    };
  }

  if (target === DEFAULT_LOCALE || !keys.length) return out;

  const rows = await db
    .select()
    .from(translations)
    .where(
      and(
        eq(translations.entityType, entityType),
        eq(translations.entityId, entityId),
        eq(translations.locale, target),
        inArray(translations.field, keys),
      ),
    );

  for (const row of rows) {
    if (!(row.field in out)) continue;
    out[row.field as keyof T] = {
      value: row.value,
      isOriginal: false,
      source: row.source,
    };
  }

  return out;
}

/**
 * Batch version for list pages — one query for many rows.
 *
 * The N+1 that `translateEntity` in a `.map()` would produce is the difference
 * between a careers list that renders in 40ms and one that renders in 2s.
 */
export async function translateRecords<T extends { id: string }>(
  entityType: string,
  records: T[],
  fields: (keyof T & string)[],
  locale?: Locale,
): Promise<Map<string, Record<string, TranslatedField>>> {
  const target = locale ?? (await getLocale());
  const result = new Map<string, Record<string, TranslatedField>>();

  for (const record of records) {
    const entry: Record<string, TranslatedField> = {};
    for (const field of fields) {
      entry[field] = {
        value: (record[field] as string | null) ?? "",
        isOriginal: true,
        source: null,
      };
    }
    result.set(record.id, entry);
  }

  if (target === DEFAULT_LOCALE || !records.length) return result;

  const rows = await db
    .select()
    .from(translations)
    .where(
      and(
        eq(translations.entityType, entityType),
        inArray(
          translations.entityId,
          records.map((r) => r.id),
        ),
        eq(translations.locale, target),
        inArray(translations.field, fields),
      ),
    );

  for (const row of rows) {
    const entry = result.get(row.entityId);
    if (!entry || !(row.field in entry)) continue;
    entry[row.field] = { value: row.value, isOriginal: false, source: row.source };
  }

  return result;
}

/** Upsert used by the admin translation screen and any import script. */
export async function upsertTranslation(input: {
  entityType: string;
  entityId: string;
  field: string;
  locale: Locale;
  value: string;
  source: "HUMAN" | "MACHINE" | "MACHINE_REVIEWED";
  reviewedById?: string | null;
}): Promise<void> {
  const reviewed = input.source !== "MACHINE";
  await db
    .insert(translations)
    .values({
      entityType: input.entityType,
      entityId: input.entityId,
      field: input.field,
      locale: input.locale,
      value: input.value,
      source: input.source,
      reviewedById: reviewed ? (input.reviewedById ?? null) : null,
      reviewedAt: reviewed ? new Date() : null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        translations.entityType,
        translations.entityId,
        translations.field,
        translations.locale,
      ],
      set: {
        value: input.value,
        source: input.source,
        reviewedById: reviewed ? (input.reviewedById ?? null) : null,
        reviewedAt: reviewed ? new Date() : null,
        updatedAt: new Date(),
      },
    });
}

/** Coverage per entity type, for the admin localisation screen. */
export async function translationCoverage(locale: Locale) {
  const rows = await db
    .select({
      entityType: translations.entityType,
      source: translations.source,
    })
    .from(translations)
    .where(eq(translations.locale, locale));

  const summary = new Map<string, { total: number; reviewed: number; machine: number }>();
  for (const row of rows) {
    const entry = summary.get(row.entityType) ?? { total: 0, reviewed: 0, machine: 0 };
    entry.total += 1;
    if (isTrustedTranslation(row.source)) entry.reviewed += 1;
    else entry.machine += 1;
    summary.set(row.entityType, entry);
  }

  return [...summary.entries()].map(([entityType, stats]) => ({ entityType, ...stats }));
}
