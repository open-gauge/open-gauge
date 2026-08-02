import type { UnitOption } from "@/lib/sensor-options";
import { getUnitsForQuantity } from "@/lib/sensor-options";

export function toSI(value: number | null | undefined, unit: string): number | null {
  if (value === null || value === undefined) return null;
  switch (unit) {
    case "°C": return value + 273.15;
    case "°F": return (value - 32) * 5 / 9 + 273.15;
    case "kPa": return value * 1_000;
    case "MPa": return value * 1_000_000;
    case "bar": return value * 100_000;
    case "psi": return value * 6894.757;
    case "hPa": return value * 100;
    case "atm": return value * 101_325;
    case "mmHg": return value * 133.322;
    case "inHg": return value * 3386.389;
    case "inH2O": return value * 249.0889;
    case "m³/h": return value / 3600;
    case "L/min": return value / 60_000;
    case "gal/min": return value * 6.309e-5;
    case "kg/h": return value / 3600;
    case "g/min": return value / 60_000;
    case "lb/min": return value * 0.00755987;
    case "mm": return value / 1000;
    case "cm": return value / 100;
    case "in": return value * 0.0254;
    case "ft": return value * 0.3048;
    case "nm": return value * 1e-9;
    case "µm": return value * 1e-6;
    case "kN": return value * 1000;
    case "kgf": return value * 9.80665;
    case "lbf": return value * 4.44822;
    case "kgf·m": return value * 9.80665;
    case "lbf·ft": return value * 1.35582;
    case "g": return value / 1000;
    case "mg": return value / 1_000_000;
    case "lb": return value * 0.45359237;
    case "µε": return value * 1e-6;
    case "°": return value * Math.PI / 180;
    case "rpm": return value * 2 * Math.PI / 60;
    case "°/s": return value * Math.PI / 180;
    case "°/s²": return value * Math.PI / 180;
    case "km/h": return value / 3.6;
    case "mph": return value * 0.44704;
    case "knots": return value * 0.514444;
    case "g-force": return value * 9.80665;
    case "mV": return value / 1000;
    case "kV": return value * 1000;
    case "mA": return value / 1000;
    case "kA": return value * 1000;
    case "kΩ": return value * 1000;
    case "MΩ": return value * 1_000_000;
    case "kW": return value * 1000;
    case "MW": return value * 1_000_000;
    case "Wh": return value * 3600;
    case "kWh": return value * 3_600_000;
    case "MWh": return value * 3_600_000_000;
    case "kHz": return value * 1000;
    case "MHz": return value * 1_000_000;
    case "GHz": return value * 1_000_000_000;
    case "bpm": return value / 60;
    case "µF": return value * 1e-6;
    case "nF": return value * 1e-9;
    case "pF": return value * 1e-12;
    case "mH": return value * 1e-3;
    case "µH": return value * 1e-6;
    case "mT": return value * 1e-3;
    case "µT": return value * 1e-6;
    case "G": return value * 1e-4;
    case "kV/m": return value * 1000;
    case "mS/cm": return value * 0.1;
    case "µS/cm": return value * 0.0001;
    case "g/cm³": return value * 1000;
    case "cP": return value * 0.001;
    case "fc": return value * 10.7639;
    case "particles/ft³": return value * 35.3147;
    default: return value;
  }
}

export function fromSI(value: number | null | undefined, unit: string): number | null {
  if (value === null || value === undefined) return null;
  switch (unit) {
    case "°C": return value - 273.15;
    case "°F": return (value - 273.15) * 9 / 5 + 32;
    case "kPa": return value / 1_000;
    case "MPa": return value / 1_000_000;
    case "bar": return value / 100_000;
    case "psi": return value / 6894.757;
    case "hPa": return value / 100;
    case "atm": return value / 101_325;
    case "mmHg": return value / 133.322;
    case "inHg": return value / 3386.389;
    case "inH2O": return value / 249.0889;
    case "m³/h": return value * 3600;
    case "L/min": return value * 60_000;
    case "gal/min": return value / 6.309e-5;
    case "kg/h": return value * 3600;
    case "g/min": return value * 60_000;
    case "lb/min": return value / 0.00755987;
    case "mm": return value * 1000;
    case "cm": return value * 100;
    case "in": return value / 0.0254;
    case "ft": return value / 0.3048;
    case "nm": return value / 1e-9;
    case "µm": return value / 1e-6;
    case "kN": return value / 1000;
    case "kgf": return value / 9.80665;
    case "lbf": return value / 4.44822;
    case "kgf·m": return value / 9.80665;
    case "lbf·ft": return value / 1.35582;
    case "g": return value * 1000;
    case "mg": return value * 1_000_000;
    case "lb": return value / 0.45359237;
    case "µε": return value / 1e-6;
    case "°": return value * 180 / Math.PI;
    case "rpm": return value * 60 / (2 * Math.PI);
    case "°/s": return value * 180 / Math.PI;
    case "°/s²": return value * 180 / Math.PI;
    case "km/h": return value * 3.6;
    case "mph": return value / 0.44704;
    case "knots": return value / 0.514444;
    case "g-force": return value / 9.80665;
    case "mV": return value * 1000;
    case "kV": return value / 1000;
    case "mA": return value * 1000;
    case "kA": return value / 1000;
    case "kΩ": return value / 1000;
    case "MΩ": return value / 1_000_000;
    case "kW": return value / 1000;
    case "MW": return value / 1_000_000;
    case "Wh": return value / 3600;
    case "kWh": return value / 3_600_000;
    case "MWh": return value / 3_600_000_000;
    case "kHz": return value / 1000;
    case "MHz": return value / 1_000_000;
    case "GHz": return value / 1_000_000_000;
    case "bpm": return value * 60;
    case "µF": return value / 1e-6;
    case "nF": return value / 1e-9;
    case "pF": return value / 1e-12;
    case "mH": return value / 1e-3;
    case "µH": return value / 1e-6;
    case "mT": return value / 1e-3;
    case "µT": return value / 1e-6;
    case "G": return value / 1e-4;
    case "kV/m": return value / 1000;
    case "mS/cm": return value / 0.1;
    case "µS/cm": return value / 0.0001;
    case "g/cm³": return value / 1000;
    case "cP": return value / 0.001;
    case "fc": return value / 10.7639;
    case "particles/ft³": return value / 35.3147;
    default: return value;
  }
}

// ---------------------------------------------------------------------------
// Magnitude conversion — for accuracy/uncertainty/resolution *values*, never
// absolute readings. This is intentionally separate from toSI/fromSI above:
// those convert a reading (e.g. temperature needs a +273.15 offset), but an
// *uncertainty* of 1°C is 1.8°F — a pure scale factor, no offset, since it
// describes a difference between two readings, not a reading itself.
// ---------------------------------------------------------------------------

/**
 * Each physical quantity maps to an array of "conversion groups" — units
 * within the same group convert to each other via a plain scale factor;
 * units in different groups (or not listed at all) are NOT offered as
 * interchangeable, because no scientifically valid constant-factor
 * conversion exists between them (e.g. %RH vs. g/m³ for humidity depends on
 * temperature and pressure; Gy vs. Sv depends on a radiation-type weighting
 * factor; Ra vs. Rz are different roughness statistics of the same profile,
 * not unit variants of one quantity; volumetric vs. mass flow needs a
 * density). Deliberately incomplete rather than silently wrong — a unit
 * missing here just isn't offered for conversion, falling back to
 * display-only.
 *
 * factor[unit] = how many of the group's own canonical unit equal 1 of
 * `unit` (so `canonicalValue = value * factor[unit]`).
 */
export type ConversionGroup = Record<string, number>;

const DEG_PER_RAD = 180 / Math.PI;

export const UNIT_CONVERSION_GROUPS: Record<string, ConversionGroup[]> = {
  temperature: [{ "°C": 1, K: 1, "°F": 5 / 9 }],
  pressure: [{
    Pa: 1, kPa: 1000, MPa: 1_000_000, bar: 100_000, psi: 6894.757293168,
    hPa: 100, atm: 101_325, mmHg: 133.322387415, inHg: 3386.389, inH2O: 249.08891,
  }],
  flow: [
    { "m³/h": 1, "L/min": 0.06, "gal/min": 0.2271246 }, // volumetric
    { "kg/h": 1, "g/min": 0.06, "lb/min": 27.2155422 }, // mass — not interconvertible with volumetric without density
  ],
  level: [{ mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048 }], // "%" excluded — meaningless without a defined range
  humidity: [{ "dew point °C": 1, "dew point °F": 5 / 9 }], // %RH, g/m³ excluded — need psychrometric context
  force: [{ N: 1, kN: 1000, kgf: 9.80665, lbf: 4.4482216153 }],
  torque: [{ Nm: 1, kNm: 1000, "lbf·ft": 1.3558179483 }],
  mass: [{ kg: 1, g: 0.001, mg: 0.000001, lb: 0.45359237 }],
  strain: [{ "m/m": 1, µε: 0.000001 }],
  displacement: [{ nm: 1e-9, µm: 1e-6, mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048 }],
  angle: [{ "°": 1 / DEG_PER_RAD, rad: 1 }],
  angular_velocity: [{ rpm: (2 * Math.PI) / 60, "°/s": 1 / DEG_PER_RAD, "rad/s": 1 }],
  angular_acceleration: [{ "°/s²": 1 / DEG_PER_RAD, "rad/s²": 1 }],
  velocity: [{ "mm/s": 0.001, "m/s": 1, "km/h": 1 / 3.6, mph: 0.44704, knots: 1852 / 3600 }],
  acceleration: [{ "m/s²": 1, g: 9.80665 }],
  voltage: [{ V: 1, mV: 0.001, kV: 1000 }],
  current: [{ A: 1, mA: 0.001, kA: 1000 }],
  resistance: [{ Ω: 1, kΩ: 1000, MΩ: 1_000_000 }],
  power: [{ W: 1, kW: 1000, MW: 1_000_000 }],
  energy: [{ Wh: 1, kWh: 1000, MWh: 1_000_000 }],
  frequency: [{ Hz: 1, kHz: 1000, MHz: 1_000_000, GHz: 1_000_000_000, bpm: 1 / 60 }],
  capacitance: [{ F: 1, µF: 1e-6, nF: 1e-9, pF: 1e-12 }],
  inductance: [{ H: 1, mH: 0.001, µH: 1e-6 }],
  impedance: [{ Ω: 1, kΩ: 1000, MΩ: 1_000_000 }],
  magnetic_field: [{ T: 1, mT: 0.001, µT: 1e-6, G: 0.0001 }],
  electric_field: [{ "V/m": 1, "kV/m": 1000 }],
  radiation: [{ Sv: 1, rem: 0.01 }], // Gy, Bq excluded — need a radiation-weighting factor / are a different quantity
  illuminance: [{ lx: 1, fc: 10.76391 }],
  concentration: [{ ppm: 1, ppb: 0.001, "%": 10_000 }], // mg/m³ excluded — mass concentration needs molar mass
  conductivity: [{ "S/m": 1, "mS/cm": 0.1, "µS/cm": 0.0001 }],
  salinity: [{ ppt: 1, PSU: 1 }], // g/L excluded — depends on solution density
  density: [{ "kg/m³": 1, "g/cm³": 1000 }],
  viscosity: [{ "Pa·s": 1, cP: 0.001 }],
  moisture: [{ "%": 0.01, "g/g": 1 }], // %RH excluded — a different physical concept (vapor pressure ratio)
  particle_concentration: [{ "particles/m³": 1, "particles/ft³": 35.3146667 }],
  precipitation: [{ mm: 0.001, in: 0.0254 }],
};

/** Convert a magnitude (accuracy/uncertainty/resolution value, never an
 * absolute reading) between two units of the same physical quantity.
 * Returns null when no defined conversion connects them (different group,
 * or the quantity/unit isn't in the table at all). */
export function convertMagnitude(value: number, fromUnit: string, toUnit: string, quantity: string): number | null {
  if (fromUnit === toUnit) return value;
  const groups = UNIT_CONVERSION_GROUPS[quantity];
  if (!groups) return null;
  for (const group of groups) {
    if (fromUnit in group && toUnit in group) {
      return (value * group[fromUnit]) / group[toUnit];
    }
  }
  return null;
}

/** Units of `quantity` that can be converted to/from `currentUnit` — for
 * populating a unit dropdown so every option is guaranteed convertible
 * (never shows a choice that would silently fail to convert). Falls back to
 * just `currentUnit` alone when the quantity/unit has no defined conversion
 * group (see UNIT_CONVERSION_GROUPS' doc comment for why some are omitted). */
export function getConvertibleUnitsFor(quantity: string, currentUnit: string): UnitOption[] {
  const groups = UNIT_CONVERSION_GROUPS[quantity];
  const group = groups?.find((g) => currentUnit in g);
  if (!group) return [{ value: currentUnit, label: currentUnit }];
  const allUnits = getUnitsForQuantity(quantity);
  const labelFor = (u: string) => allUnits.find((o) => o.value === u)?.label ?? u;
  return Object.keys(group).map((u) => ({ value: u, label: labelFor(u) }));
}
