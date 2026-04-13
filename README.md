# @arraypress/tax-calculator

Pure tax computation for ecommerce. Exclusive and inclusive tax modes, per-line distribution with exact rounding, product type filtering, and jurisdiction matching. All amounts in cents.

## Installation

```bash
npm install @arraypress/tax-calculator
```

## Quick Start

```javascript
import { computeTax, matchTaxRate } from '@arraypress/tax-calculator';

// Find the best matching rate for the customer's location
const rate = matchTaxRate(taxRates, 'US', 'CA');

// Compute tax
const result = computeTax({
  lineItems: [
    { unitAmount: 5000, quantity: 1, productType: 'physical' },
    { unitAmount: 3000, quantity: 2, productType: 'digital' },
  ],
  rate: { rate: 8.25, taxType: 'exclusive', appliesTo: 'all' },
});
// result.taxAmount === 907 (8.25% of 11000)
// result.lineItems — each has taxAmount and taxRate stamped
```

## API

### `computeTax({ lineItems, rate })`

Compute tax for a set of line items given a rate. Pure function — does not mutate input.

**Tax modes:**
- `exclusive` — tax is added on top. `taxAmount` is the extra charge.
- `inclusive` — tax is in the price. `taxAmount` is 0, but `inclusiveTaxAmount` reports what's embedded.

**Product type filtering** via `rate.appliesTo`:
- `'all'` — every line is taxable
- `'physical'` — only `productType === 'physical'` lines
- `'digital'` — only non-physical lines

**Per-line exemptions:** Set `taxExempt: true` on any line item to exclude it from tax regardless of product type or `appliesTo`. Use for tax-exempt customers, reseller certificates, or individual product overrides.

```javascript
computeTax({
  lineItems: [
    { unitAmount: 5000, quantity: 1, productType: 'physical' },
    { unitAmount: 3000, quantity: 1, productType: 'physical', taxExempt: true },
  ],
  rate: { rate: 10, taxType: 'exclusive', appliesTo: 'all' },
});
// taxableAmount: 5000 (exempt line excluded)
// taxAmount: 500
```

**Returns** `TaxResult`:
- `taxAmount` — tax to add (0 for inclusive)
- `inclusiveTaxAmount` — tax embedded in price (0 for exclusive)
- `taxableAmount` — sum of taxable line item amounts
- `lineItems` — cloned items with `taxAmount` and `taxRate` set

**Rounding:** Order-level tax is computed first, then distributed by revenue share. The last taxable line absorbs any remainder so per-line sum always equals the order total exactly.

### `matchTaxRate(rates, country, state?)`

Find the most specific matching tax rate from a list.

**Priority:**
1. Exact country + state match
2. Country-only match (state is null on the rate)
3. Default rate (country is null)

Only enabled rates are considered. Returns `null` if no match. Case-insensitive.

## Tax Modes

**Exclusive** (US-style): Prices are pre-tax. Tax is calculated and added at checkout.
```
Subtotal: $100.00 + Tax: $8.25 = Total: $108.25
```

**Inclusive** (EU/UK-style): Prices already include tax. The tax amount is extracted for receipt purposes but nothing is added to the total.
```
Price: £120.00 (includes £20.00 VAT) = Total: £120.00
```

## License

MIT
