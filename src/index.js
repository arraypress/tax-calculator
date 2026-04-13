/**
 * @arraypress/tax-calculator
 *
 * Pure tax computation for ecommerce. Computes tax amounts from a rate
 * and line items, handles exclusive (tax added on top) vs inclusive
 * (tax already in price) modes, filters by product type, and distributes
 * the order-level tax across lines by revenue share with exact rounding.
 *
 * All monetary amounts are in cents (integer math, no floating point).
 *
 * This library does NOT handle jurisdiction matching (which rate applies
 * to which country/state) — that's a DB lookup concern. It takes an
 * already-resolved rate and computes the math.
 *
 * @module @arraypress/tax-calculator
 */

/**
 * Compute the tax for a set of line items given a tax rate.
 *
 * Handles two tax modes:
 * - **exclusive**: Tax is added on top of the price. `taxAmount` is the
 *   extra charge. Per-line `taxAmount` values are distributed by revenue share.
 * - **inclusive**: Tax is already included in the price. `taxAmount` is 0
 *   (nothing extra to charge), but `inclusiveTaxAmount` reports what's embedded
 *   for receipt/breakdown purposes. Per-line `taxRate` is still stamped.
 *
 * Product type filtering via `appliesTo`:
 * - `'all'` — every line is taxable
 * - `'physical'` — only lines with `productType === 'physical'`
 * - `'digital'` — only lines with `productType !== 'physical'`
 *
 * Rounding: the order-level tax is computed first, then distributed across
 * taxable lines by revenue share. The last taxable line absorbs any rounding
 * remainder so the per-line sum always equals the order-level tax exactly.
 *
 * @param {object} params - Computation parameters.
 * @param {Array<import('./index').TaxLineItem>} params.lineItems - Cart line items.
 * @param {import('./index').TaxRate} params.rate - The tax rate to apply.
 * @returns {import('./index').TaxResult} Computed tax breakdown.
 *
 * Per-line exemptions: if a line item has `taxExempt: true`, it is
 * excluded from tax computation regardless of product type or appliesTo.
 * Use this for tax-exempt customers, reseller certificates, or
 * individual product overrides.
 *
 * @example
 * // 20% exclusive tax on two items
 * const result = computeTax({
 *   lineItems: [
 *     { unitAmount: 5000, quantity: 1, productType: 'physical' },
 *     { unitAmount: 3000, quantity: 2, productType: 'physical' },
 *   ],
 *   rate: { rate: 20, taxType: 'exclusive', appliesTo: 'all' },
 * });
 * // result.taxAmount === 2200 (20% of 11000)
 *
 * @example
 * // Tax-exempt line item is excluded
 * const result = computeTax({
 *   lineItems: [
 *     { unitAmount: 5000, quantity: 1, productType: 'physical' },
 *     { unitAmount: 3000, quantity: 1, productType: 'physical', taxExempt: true },
 *   ],
 *   rate: { rate: 10, taxType: 'exclusive', appliesTo: 'all' },
 * });
 * // result.taxableAmount === 5000 (exempt line excluded)
 * // result.taxAmount === 500
 *
 * @example
 * // Inclusive tax — nothing added, but breakdown is reported
 * const result = computeTax({
 *   lineItems: [{ unitAmount: 12000, quantity: 1, productType: 'digital' }],
 *   rate: { rate: 20, taxType: 'inclusive', appliesTo: 'all' },
 * });
 * // result.taxAmount === 0 (nothing extra to charge)
 * // result.inclusiveTaxAmount === 2000 (embedded in price)
 */
export function computeTax({ lineItems, rate }) {
  // Clone line items so we don't mutate the input
  const lines = lineItems.map(li => ({
    ...li,
    taxAmount: 0,
    taxRate: 0,
  }));

  const result = {
    taxAmount: 0,
    inclusiveTaxAmount: 0,
    taxableAmount: 0,
    rate,
    lineItems: lines,
  };

  if (!rate || rate.rate <= 0) return result;

  // Determine which lines are taxable based on appliesTo + per-line exemptions
  const isTaxable = (li) => {
    if (li.taxExempt) return false;
    if (rate.appliesTo === 'physical' && li.productType !== 'physical') return false;
    if (rate.appliesTo === 'digital' && li.productType === 'physical') return false;
    return true;
  };

  // Calculate taxable amount
  const taxableAmount = lines.reduce((sum, li) => {
    if (!isTaxable(li)) return sum;
    return sum + li.unitAmount * li.quantity;
  }, 0);

  result.taxableAmount = taxableAmount;

  if (taxableAmount === 0) return result;

  // Stamp the rate on every taxable line
  for (const li of lines) {
    if (isTaxable(li)) li.taxRate = rate.rate;
  }

  // Inclusive: tax is in the price, report but don't add on top
  if (rate.taxType === 'inclusive') {
    result.inclusiveTaxAmount = Math.round((taxableAmount * rate.rate) / (100 + rate.rate));
    return result;
  }

  // Exclusive: compute and distribute
  const taxAmount = Math.round((taxableAmount * rate.rate) / 100);
  result.taxAmount = taxAmount;

  // Distribute across taxable lines by revenue share
  let distributed = 0;
  let lastTaxableIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (isTaxable(lines[i])) lastTaxableIdx = i;
  }

  for (let i = 0; i < lines.length; i++) {
    const li = lines[i];
    if (!isTaxable(li)) continue;
    if (i === lastTaxableIdx) {
      li.taxAmount = taxAmount - distributed;
    } else {
      const lineGross = li.unitAmount * li.quantity;
      const share = Math.round((taxAmount * lineGross) / taxableAmount);
      li.taxAmount = share;
      distributed += share;
    }
  }

  return result;
}

/**
 * Find the most specific matching tax rate from a list of rates for
 * a given country and state.
 *
 * Jurisdiction matching priority (most specific wins):
 *   1. Exact country + state match
 *   2. Country-only match (state is null on the rate)
 *   3. Default rate (country is null — applies to all)
 *
 * Only enabled rates are considered.
 *
 * @param {Array<import('./index').StoredTaxRate>} rates - All available tax rates.
 * @param {string} country - Customer's country code (e.g. 'US', 'GB').
 * @param {string} [state] - Customer's state/region code (e.g. 'CA', 'TX').
 * @returns {import('./index').StoredTaxRate | null} The best matching rate, or null.
 *
 * @example
 * const rates = [
 *   { id: 1, name: 'US-CA', rate: 8.25, country: 'US', state: 'CA', enabled: true, ... },
 *   { id: 2, name: 'US Default', rate: 5, country: 'US', state: null, enabled: true, ... },
 *   { id: 3, name: 'Global', rate: 0, country: null, state: null, enabled: true, ... },
 * ];
 * matchTaxRate(rates, 'US', 'CA'); // returns rate #1 (exact match)
 * matchTaxRate(rates, 'US', 'TX'); // returns rate #2 (country-only fallback)
 * matchTaxRate(rates, 'GB');       // returns rate #3 (global default)
 * matchTaxRate(rates, 'JP');       // returns rate #3 (global default)
 */
export function matchTaxRate(rates, country, state) {
  const enabled = rates.filter(r => r.enabled !== false && r.enabled !== 0);
  const c = (country || '').trim().toUpperCase();
  const s = (state || '').trim().toUpperCase();

  if (!c) return null;

  // 1. Exact country + state
  if (s) {
    const exact = enabled.find(r =>
      r.country && r.country.toUpperCase() === c &&
      r.state && r.state.toUpperCase() === s
    );
    if (exact) return exact;
  }

  // 2. Country-only (state is null)
  const countryOnly = enabled.find(r =>
    r.country && r.country.toUpperCase() === c &&
    !r.state
  );
  if (countryOnly) return countryOnly;

  // 3. Default (country is null)
  const defaultRate = enabled.find(r => !r.country);
  return defaultRate || null;
}
