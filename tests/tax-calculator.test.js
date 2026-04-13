import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeTax, matchTaxRate } from '../src/index.js';

describe('computeTax', () => {
  it('exclusive: computes 20% tax on single item', () => {
    const result = computeTax({
      lineItems: [{ unitAmount: 10000, quantity: 1, productType: 'physical' }],
      rate: { rate: 20, taxType: 'exclusive', appliesTo: 'all' },
    });
    assert.strictEqual(result.taxAmount, 2000);
    assert.strictEqual(result.taxableAmount, 10000);
    assert.strictEqual(result.lineItems[0].taxAmount, 2000);
    assert.strictEqual(result.lineItems[0].taxRate, 20);
  });

  it('exclusive: distributes across multiple items by revenue share', () => {
    const result = computeTax({
      lineItems: [
        { unitAmount: 7000, quantity: 1, productType: 'physical' },
        { unitAmount: 3000, quantity: 1, productType: 'physical' },
      ],
      rate: { rate: 10, taxType: 'exclusive', appliesTo: 'all' },
    });
    assert.strictEqual(result.taxAmount, 1000);
    const sum = result.lineItems.reduce((s, li) => s + li.taxAmount, 0);
    assert.strictEqual(sum, 1000); // per-line sum equals order tax
  });

  it('exclusive: last item absorbs rounding remainder', () => {
    const result = computeTax({
      lineItems: [
        { unitAmount: 3333, quantity: 1, productType: 'digital' },
        { unitAmount: 3333, quantity: 1, productType: 'digital' },
        { unitAmount: 3334, quantity: 1, productType: 'digital' },
      ],
      rate: { rate: 7, taxType: 'exclusive', appliesTo: 'all' },
    });
    const sum = result.lineItems.reduce((s, li) => s + li.taxAmount, 0);
    assert.strictEqual(sum, result.taxAmount);
  });

  it('exclusive: handles quantity > 1', () => {
    const result = computeTax({
      lineItems: [{ unitAmount: 2500, quantity: 4, productType: 'physical' }],
      rate: { rate: 10, taxType: 'exclusive', appliesTo: 'all' },
    });
    assert.strictEqual(result.taxableAmount, 10000);
    assert.strictEqual(result.taxAmount, 1000);
  });

  it('inclusive: taxAmount is 0, inclusiveTaxAmount is reported', () => {
    const result = computeTax({
      lineItems: [{ unitAmount: 12000, quantity: 1, productType: 'digital' }],
      rate: { rate: 20, taxType: 'inclusive', appliesTo: 'all' },
    });
    assert.strictEqual(result.taxAmount, 0);
    assert.strictEqual(result.inclusiveTaxAmount, 2000); // 12000 * 20 / 120
  });

  it('inclusive: per-line taxAmount stays 0', () => {
    const result = computeTax({
      lineItems: [{ unitAmount: 12000, quantity: 1, productType: 'digital' }],
      rate: { rate: 20, taxType: 'inclusive', appliesTo: 'all' },
    });
    assert.strictEqual(result.lineItems[0].taxAmount, 0);
    assert.strictEqual(result.lineItems[0].taxRate, 20);
  });

  it('appliesTo physical: only physical items are taxed', () => {
    const result = computeTax({
      lineItems: [
        { unitAmount: 5000, quantity: 1, productType: 'physical' },
        { unitAmount: 3000, quantity: 1, productType: 'digital' },
      ],
      rate: { rate: 10, taxType: 'exclusive', appliesTo: 'physical' },
    });
    assert.strictEqual(result.taxableAmount, 5000);
    assert.strictEqual(result.taxAmount, 500);
    assert.strictEqual(result.lineItems[0].taxRate, 10);
    assert.strictEqual(result.lineItems[1].taxRate, 0);
  });

  it('appliesTo digital: only digital items are taxed', () => {
    const result = computeTax({
      lineItems: [
        { unitAmount: 5000, quantity: 1, productType: 'physical' },
        { unitAmount: 3000, quantity: 1, productType: 'digital' },
      ],
      rate: { rate: 20, taxType: 'exclusive', appliesTo: 'digital' },
    });
    assert.strictEqual(result.taxableAmount, 3000);
    assert.strictEqual(result.taxAmount, 600);
  });

  it('zero rate returns zero tax', () => {
    const result = computeTax({
      lineItems: [{ unitAmount: 10000, quantity: 1, productType: 'physical' }],
      rate: { rate: 0, taxType: 'exclusive', appliesTo: 'all' },
    });
    assert.strictEqual(result.taxAmount, 0);
    assert.strictEqual(result.taxableAmount, 0);
  });

  it('null rate returns zero tax', () => {
    const result = computeTax({
      lineItems: [{ unitAmount: 10000, quantity: 1, productType: 'physical' }],
      rate: null,
    });
    assert.strictEqual(result.taxAmount, 0);
  });

  it('no taxable items returns zero', () => {
    const result = computeTax({
      lineItems: [{ unitAmount: 5000, quantity: 1, productType: 'digital' }],
      rate: { rate: 20, taxType: 'exclusive', appliesTo: 'physical' },
    });
    assert.strictEqual(result.taxAmount, 0);
    assert.strictEqual(result.taxableAmount, 0);
  });

  it('does not mutate input line items', () => {
    const original = [{ unitAmount: 5000, quantity: 1, productType: 'physical' }];
    computeTax({ lineItems: original, rate: { rate: 10, taxType: 'exclusive', appliesTo: 'all' } });
    assert.strictEqual(original[0].taxAmount, undefined);
  });
});

describe('matchTaxRate', () => {
  const rates = [
    { id: 1, name: 'US-CA', rate: 8.25, country: 'US', state: 'CA', enabled: true },
    { id: 2, name: 'US-NY', rate: 8, country: 'US', state: 'NY', enabled: true },
    { id: 3, name: 'US Default', rate: 5, country: 'US', state: null, enabled: true },
    { id: 4, name: 'UK VAT', rate: 20, country: 'GB', state: null, enabled: true },
    { id: 5, name: 'Global', rate: 0, country: null, state: null, enabled: true },
    { id: 6, name: 'Disabled', rate: 99, country: 'DE', state: null, enabled: false },
  ];

  it('exact country + state match', () => {
    const match = matchTaxRate(rates, 'US', 'CA');
    assert.strictEqual(match.id, 1);
  });

  it('country-only fallback when state has no match', () => {
    const match = matchTaxRate(rates, 'US', 'TX');
    assert.strictEqual(match.id, 3);
  });

  it('country match without state', () => {
    const match = matchTaxRate(rates, 'GB');
    assert.strictEqual(match.id, 4);
  });

  it('global default fallback', () => {
    const match = matchTaxRate(rates, 'JP');
    assert.strictEqual(match.id, 5);
  });

  it('skips disabled rates', () => {
    const match = matchTaxRate(rates, 'DE');
    assert.strictEqual(match.id, 5); // falls through to global, not the disabled DE rate
  });

  it('returns null for empty country', () => {
    const match = matchTaxRate(rates, '');
    assert.strictEqual(match, null);
  });

  it('case insensitive matching', () => {
    const match = matchTaxRate(rates, 'us', 'ca');
    assert.strictEqual(match.id, 1);
  });

  it('returns null when no rates match', () => {
    const match = matchTaxRate([], 'US');
    assert.strictEqual(match, null);
  });
});
