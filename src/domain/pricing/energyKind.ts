/**
 * What the car runs on, and therefore what is being counted.
 *
 * The unit is derived from the kind rather than stored alongside it. A trip
 * cannot then end up claiming to measure litres of electricity, and the one
 * control the user sees settles both the unit and which price to look up.
 */

export type EnergyKind = 'gasoline' | 'diesel' | 'lpg' | 'electric'
export type EnergyUnit = 'liter' | 'kwh'

export const ENERGY_KINDS: readonly EnergyKind[] = ['gasoline', 'diesel', 'lpg', 'electric']

export const ENERGY_KIND_LABELS: Record<EnergyKind, string> = {
  gasoline: 'Petrol',
  diesel: 'Diesel',
  lpg: 'LPG',
  electric: 'Electric',
}

export function isEnergyKind(value: unknown): value is EnergyKind {
  return typeof value === 'string' && (ENERGY_KINDS as readonly string[]).includes(value)
}

export function unitFor(kind: EnergyKind): EnergyUnit {
  return kind === 'electric' ? 'kwh' : 'liter'
}

export function unitLabel(unit: EnergyUnit): string {
  return unit === 'kwh' ? 'kWh' : 'L'
}

export function unitLabelFor(kind: EnergyKind): string {
  return unitLabel(unitFor(kind))
}

/** How consumption is written for this kind, e.g. "L/100 km". */
export function consumptionLabelFor(kind: EnergyKind): string {
  return `${unitLabelFor(kind)}/100 km`
}

export function formatEnergy(quantity: number, kind: EnergyKind): string {
  const rounded = Math.round(quantity * 10) / 10
  const value = rounded.toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return `${value} ${unitLabelFor(kind)}`
}

/**
 * Charging is not priced nationally in any useful way — where you plug in
 * matters far more than which country you are in — so an electric trip gets no
 * prefilled price, and this explains why instead of guessing.
 */
export function canLookUpPrice(kind: EnergyKind): boolean {
  return kind !== 'electric'
}
