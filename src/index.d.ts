/** A line item for tax computation. */
export interface TaxLineItem {
  /** Unit price in cents. */
  unitAmount: number;
  /** Quantity ordered. */
  quantity: number;
  /** Product type for applies_to filtering: 'physical', 'digital', 'bundle', etc. */
  productType: string;
  /** When true, this line is exempt from tax regardless of rate or product type. */
  taxExempt?: boolean;
  /** Tax amount allocated to this line (set by computeTax). */
  taxAmount?: number;
  /** Tax rate percentage applied to this line (set by computeTax). */
  taxRate?: number;
}

/** A tax rate to apply. */
export interface TaxRate {
  /** Tax percentage (e.g. 20 for 20%). */
  rate: number;
  /** 'exclusive' adds tax on top; 'inclusive' means price already includes tax. */
  taxType: 'exclusive' | 'inclusive';
  /** Which product types this rate applies to: 'all', 'physical', or 'digital'. */
  appliesTo: 'all' | 'physical' | 'digital';
}

/** A stored tax rate with jurisdiction info (for matchTaxRate). */
export interface StoredTaxRate {
  /** Rate ID. */
  id: number;
  /** Display name (e.g. 'US-CA Sales Tax'). */
  name: string;
  /** Tax percentage (e.g. 20 for 20%). */
  rate: number;
  /** 'exclusive' or 'inclusive'. */
  taxType?: 'exclusive' | 'inclusive';
  /** Tax type as stored in DB (alternative field name). */
  tax_type?: string;
  /** Which product types: 'all', 'physical', 'digital'. */
  appliesTo?: string;
  /** Which product types (alternative field name). */
  applies_to?: string;
  /** Country code (null = applies to all countries). */
  country: string | null;
  /** State/region code (null = applies to entire country). */
  state: string | null;
  /** Whether this rate is enabled. */
  enabled?: boolean | number;
}

/** Parameters for computeTax. */
export interface ComputeTaxParams {
  /** Cart line items. */
  lineItems: TaxLineItem[];
  /** The tax rate to apply. */
  rate: TaxRate;
}

/** Result of a tax computation. */
export interface TaxResult {
  /** Tax amount to add (0 for inclusive mode). In cents. */
  taxAmount: number;
  /** Tax embedded in inclusive prices (0 for exclusive mode). In cents. */
  inclusiveTaxAmount: number;
  /** Total taxable amount before tax. In cents. */
  taxableAmount: number;
  /** The rate that was applied. */
  rate: TaxRate;
  /** Line items with taxAmount and taxRate stamped. */
  lineItems: (TaxLineItem & { taxAmount: number; taxRate: number })[];
}

/** Compute tax for line items given a rate. Pure function. */
export function computeTax(params: ComputeTaxParams): TaxResult;

/** Find the most specific matching tax rate for a country/state from a list of rates. */
export function matchTaxRate(rates: StoredTaxRate[], country: string, state?: string): StoredTaxRate | null;
