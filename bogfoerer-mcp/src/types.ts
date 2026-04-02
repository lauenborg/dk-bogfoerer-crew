// ─── Moms-typer ───

export interface MomsDeduction {
  readonly id: string;
  readonly category: string;
  readonly rate: number;
  readonly description: string;
  readonly conditions: string;
  readonly law_reference: string;
  readonly keywords: readonly string[];
}

export interface MomsExemption {
  readonly id: string;
  readonly category: string;
  readonly description: string;
  readonly law_reference: string;
  readonly keywords: readonly string[];
}

export interface MomsDeadline {
  readonly id: string;
  readonly period_type: string;
  readonly period: string;
  readonly deadline: string;
  readonly description: string;
  readonly keywords: readonly string[];
}

export interface ZeroRate {
  readonly id: string;
  readonly category: string;
  readonly rate: number;
  readonly description: string;
  readonly effective_date: string;
  readonly law_reference: string;
  readonly keywords: readonly string[];
}

export interface MomsRates {
  readonly standard: {
    readonly rate: number;
    readonly description: string;
    readonly law_reference: string;
    readonly keywords: readonly string[];
  };
  readonly reduced: readonly unknown[];
  readonly zero: readonly ZeroRate[];
  readonly zero_vs_exempt_explanation: string;
  readonly eu_rates_overview: Record<string, unknown>;
}

export interface Invoicing {
  readonly required_fields: readonly string[];
  readonly simplified_threshold: number;
  readonly credit_notes: Record<string, unknown>;
  readonly electronic_invoicing: Record<string, unknown>;
  readonly currency_rules: Record<string, unknown>;
  readonly backdating_forbidden: string;
  readonly eu_trade_requirements: Record<string, unknown>;
  readonly keywords: readonly string[];
}

export interface SpecialScheme {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly who?: string;
  readonly calculation?: string;
  readonly example?: string;
  readonly methods?: unknown;
  readonly repair_deduction?: unknown;
  readonly voluntary?: unknown;
  readonly law_reference: string;
  readonly keywords: readonly string[];
}

export interface Change2026 {
  readonly id: string;
  readonly title: string;
  readonly effective_date: string;
  readonly description: string;
  readonly law_reference: string;
  readonly keywords: readonly string[];
}

export interface MomsRule {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly description: string;
  readonly details: string;
  readonly law_reference: string;
  readonly keywords: readonly string[];
  readonly source: string;
}

export interface MomsDatabase {
  readonly meta: Record<string, unknown>;
  readonly rates: MomsRates;
  readonly registration: Record<string, unknown>;
  readonly deductions: readonly MomsDeduction[];
  readonly exemptions: readonly MomsExemption[];
  readonly deadlines: readonly MomsDeadline[];
  readonly invoicing: Invoicing;
  readonly international: Record<string, unknown>;
  readonly special_schemes: readonly SpecialScheme[];
  readonly vehicles: Record<string, unknown>;
  readonly penalties: Record<string, unknown>;
  readonly corrections: Record<string, unknown>;
  readonly accounting: Record<string, unknown>;
  readonly investment_goods: Record<string, unknown>;
  readonly withdrawal_vat: Record<string, unknown>;
  readonly bad_debts: Record<string, unknown>;
  readonly outslay_rules: Record<string, unknown>;
  readonly room_rental: Record<string, unknown>;
  readonly business_closure: Record<string, unknown>;
  readonly changes_2026: readonly Change2026[];
  readonly rules: readonly MomsRule[];
  readonly key_amounts: Record<string, unknown>;
  readonly contacts: Record<string, unknown>;
}

// ─── Skat-typer ───

export interface SkatDeduction {
  readonly id: string;
  readonly name: string;
  readonly rate_percent?: number;
  readonly rate_percent_2025?: number;
  readonly max_amount?: number;
  readonly max_amount_2025?: number;
  readonly min_income_full_deduction?: number;
  readonly description: string;
  readonly conditions: string;
  readonly law_reference: string;
  readonly keywords: readonly string[];
}

export interface PensionRule {
  readonly id: string;
  readonly type: string;
  readonly max_deduction?: number;
  readonly max_deduction_2025?: number;
  readonly fradrag?: string;
  readonly fradrag_type?: string;
  readonly beskatning_udbetaling?: string;
  readonly afgift_ophaevelse?: string;
  readonly udbetaling_regler?: string;
  readonly description: string;
  readonly law_reference: string;
  readonly keywords: readonly string[];
}

export interface EmployeeBenefit {
  readonly id: string;
  readonly name: string;
  readonly rate?: string;
  readonly min_value?: number;
  readonly after_36_months_reduction?: string;
  readonly miljoe_tillaeg?: string;
  readonly description: string;
  readonly law_reference: string;
  readonly keywords: readonly string[];
}

export interface SkatDeadline {
  readonly id: string;
  readonly type: string;
  readonly deadline: string;
  readonly description: string;
  readonly keywords: readonly string[];
}

export interface SkatChange2026 {
  readonly id: string;
  readonly title: string;
  readonly effective_date: string;
  readonly description: string;
  readonly law_reference: string;
  readonly keywords: readonly string[];
}

export interface SkatRule {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly description: string;
  readonly keywords: readonly string[];
}

export interface SkatDatabase {
  readonly meta: Record<string, unknown>;
  readonly income_tax: Record<string, unknown>;
  readonly deductions: readonly SkatDeduction[];
  readonly capital_income: Record<string, unknown>;
  readonly share_income: Record<string, unknown>;
  readonly pension: readonly PensionRule[];
  readonly property_tax: Record<string, unknown>;
  readonly corporate_tax: Record<string, unknown>;
  readonly virksomhedsordningen: Record<string, unknown>;
  readonly kapitalafkastordningen?: Record<string, unknown>;
  readonly employee_benefits: readonly EmployeeBenefit[];
  readonly travel_allowances: Record<string, unknown>;
  readonly inheritance_gift: Record<string, unknown>;
  readonly moms?: Record<string, unknown>;
  readonly loenssumsafgift?: Record<string, unknown>;
  readonly forskerordningen?: Record<string, unknown>;
  readonly deadlines: readonly SkatDeadline[];
  readonly changes_2026: readonly SkatChange2026[];
  readonly rules: readonly SkatRule[];
  readonly key_amounts: Record<string, unknown>;
}

// ─── Søgeresultat ───

export interface SearchResult {
  readonly title: string;
  readonly category: string;
  readonly description: string;
  readonly score: number;
  readonly law_reference: string;
  readonly source: string;
}

// ─── Retsinformation API typer ───

export interface RetsinfoLaw {
  readonly year: number;
  readonly number: number;
  readonly title?: string;
  readonly ressort?: string;
  readonly document_type?: string;
  readonly historical?: boolean;
}

export interface RetsinfoSearchResult {
  readonly items: readonly RetsinfoLaw[];
  readonly total: number;
}
