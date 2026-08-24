"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import { formatMoney } from "@/modules/shared/format";

/**
 * Deliberately shows the arithmetic rather than a verdict. The number this
 * produces is a required volume, not a forecast, and the copy says so.
 */
export function BreakEvenCalculator({
  defaultFixedCost,
  currencyCode,
}: {
  defaultFixedCost: number;
  currencyCode: string;
}) {
  const [fixedCost, setFixedCost] = useState(String(defaultFixedCost));
  const [price, setPrice] = useState("");
  const [variableCost, setVariableCost] = useState("");

  const fixed = Number(fixedCost) || 0;
  const unitPrice = Number(price) || 0;
  const unitCost = Number(variableCost) || 0;
  const contribution = unitPrice - unitCost;

  const unitsNeeded = contribution > 0 ? Math.ceil(fixed / contribution) : null;
  const perDay = unitsNeeded ? Math.ceil(unitsNeeded / 26) : null;

  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold">Work it out with your own numbers</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="fixed" className="mb-1 block text-xs font-medium text-muted">
            Monthly fixed cost ({currencyCode})
          </label>
          <input
            id="fixed"
            type="number"
            min="0"
            value={fixedCost}
            onChange={(event) => setFixedCost(event.target.value)}
            className="w-full rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </div>
        <div>
          <label htmlFor="price" className="mb-1 block text-xs font-medium text-muted">
            Price you charge per unit
          </label>
          <input
            id="price"
            type="number"
            min="0"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="e.g. 120"
            className="w-full rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </div>
        <div>
          <label htmlFor="variable" className="mb-1 block text-xs font-medium text-muted">
            What each unit costs you
          </label>
          <input
            id="variable"
            type="number"
            min="0"
            value={variableCost}
            onChange={(event) => setVariableCost(event.target.value)}
            placeholder="e.g. 75"
            className="w-full rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-[var(--surface-sunken)] p-4">
        {unitPrice === 0 || unitCost === 0 ? (
          <p className="text-sm text-muted">
            Enter your price and your per-unit cost to see the volume you&rsquo;d need.
          </p>
        ) : contribution <= 0 ? (
          <p className="text-sm font-medium text-red-600 dark:text-red-400">
            At {formatMoney(unitPrice, currencyCode)} a unit against a cost of{" "}
            {formatMoney(unitCost, currencyCode)}, every sale loses you money. No volume fixes that
            — the price or the cost has to change first.
          </p>
        ) : (
          <>
            <p className="text-sm">
              Contribution per unit:{" "}
              <strong className="tabular-nums">{formatMoney(contribution, currencyCode)}</strong>
            </p>
            <p className="mt-2 text-sm">
              You&rsquo;d need{" "}
              <strong className="tabular-nums text-lg">{unitsNeeded?.toLocaleString("en-IN")}</strong>{" "}
              units a month to cover fixed costs — roughly{" "}
              <strong className="tabular-nums">{perDay}</strong> a day across 26 working days.
            </p>
            <p className="mt-2 text-xs text-faint">
              That is the volume required to break even, not a prediction that you will reach it.
              Everything above break-even is profit; everything below it comes out of your capital.
            </p>
          </>
        )}
      </div>
    </Card>
  );
}
