export interface SubtypeOption {
  value: string;
  label: string;
}

export interface TechFamilyOption {
  value: string;
  label: string;
  subtypes?: SubtypeOption[];
}

export interface UnitOption {
  value: string;
  label: string;
}

export interface PhysicalQuantityDef {
  value: string;
  label: string;
  units: UnitOption[];
  technologies: TechFamilyOption[];
}

export const PHYSICAL_QUANTITIES: PhysicalQuantityDef[] = [
  {
    value: "temperature", label: "Temperature",
    units: [{ value: "°C", label: "°C" }, { value: "°F", label: "°F" }, { value: "K", label: "K" }],
    technologies: [
      { value: "thermocouple", label: "Thermocouple", subtypes: [
        { value: "thermocouple type J", label: "Type J" },
        { value: "thermocouple type K", label: "Type K" },
        { value: "thermocouple type T", label: "Type T" },
        { value: "thermocouple type E", label: "Type E" },
        { value: "thermocouple type N", label: "Type N" },
        { value: "thermocouple type R", label: "Type R" },
        { value: "thermocouple type S", label: "Type S" },
        { value: "thermocouple type B", label: "Type B" },
      ]},
      { value: "RTD", label: "RTD", subtypes: [
        { value: "RTD PT100", label: "PT100" },
        { value: "RTD PT1000", label: "PT1000" },
        { value: "RTD other", label: "Other" },
      ]},
      { value: "thermistor", label: "Thermistor", subtypes: [
        { value: "thermistor NTC", label: "NTC" },
        { value: "thermistor PTC", label: "PTC" },
        { value: "thermistor other", label: "Other" },
      ]},
      { value: "infrared", label: "Infrared" },
      { value: "fiber optic", label: "Fiber Optic" },
      { value: "semiconductor", label: "Semiconductor" },
      { value: "bimetallic", label: "Bimetallic" },
    ],
  },
  {
    value: "pressure", label: "Pressure",
    units: [
      { value: "Pa", label: "Pa" }, { value: "kPa", label: "kPa" }, { value: "MPa", label: "MPa" },
      { value: "bar", label: "bar" }, { value: "psi", label: "psi" }, { value: "hPa", label: "hPa" },
      { value: "atm", label: "atm" }, { value: "mmHg", label: "mmHg" }, { value: "inHg", label: "inHg" },
      { value: "inH2O", label: "inH2O" },
    ],
    technologies: [
      { value: "strain gauge", label: "Strain Gauge" },
      { value: "piezoresistive", label: "Piezoresistive" },
      { value: "piezoelectric", label: "Piezoelectric" },
      { value: "capacitive", label: "Capacitive" },
      { value: "inductive", label: "Inductive" },
      { value: "resonant", label: "Resonant" },
      { value: "optical", label: "Optical" },
      { value: "MEMS", label: "MEMS" },
    ],
  },
  {
    value: "flow", label: "Flow",
    units: [
      { value: "m³/h", label: "m³/h" }, { value: "L/min", label: "L/min" }, { value: "gal/min", label: "gal/min" },
      { value: "kg/h", label: "kg/h" }, { value: "g/min", label: "g/min" }, { value: "lb/min", label: "lb/min" },
    ],
    technologies: [
      { value: "differential pressure", label: "Differential Pressure" },
      { value: "orifice plate", label: "Orifice Plate" },
      { value: "venturi", label: "Venturi" },
      { value: "turbine", label: "Turbine" },
      { value: "positive displacement", label: "Positive Displacement" },
      { value: "electromagnetic", label: "Electromagnetic" },
      { value: "vortex", label: "Vortex" },
      { value: "coriolis", label: "Coriolis" },
      { value: "ultrasonic", label: "Ultrasonic" },
      { value: "thermal mass", label: "Thermal Mass" },
    ],
  },
  {
    value: "level", label: "Level",
    units: [
      { value: "mm", label: "mm" }, { value: "cm", label: "cm" }, { value: "m", label: "m" },
      { value: "in", label: "in" }, { value: "ft", label: "ft" }, { value: "%", label: "%" },
    ],
    technologies: [
      { value: "float", label: "Float" },
      { value: "hydrostatic", label: "Hydrostatic" },
      { value: "capacitive", label: "Capacitive" },
      { value: "conductive", label: "Conductive" },
      { value: "ultrasonic", label: "Ultrasonic" },
      { value: "radar", label: "Radar" },
      { value: "laser", label: "Laser" },
      { value: "optical", label: "Optical" },
    ],
  },
  {
    value: "humidity", label: "Humidity",
    units: [
      { value: "%RH", label: "%RH" }, { value: "g/m³", label: "g/m³" },
      { value: "dew point °C", label: "Dew Point °C" }, { value: "dew point °F", label: "Dew Point °F" },
    ],
    technologies: [
      { value: "capacitive", label: "Capacitive" },
      { value: "resistive", label: "Resistive" },
      { value: "thermal conductivity", label: "Thermal Conductivity" },
      { value: "chilled mirror", label: "Chilled Mirror" },
    ],
  },
  {
    value: "force", label: "Force",
    units: [
      { value: "N", label: "N" }, { value: "kN", label: "kN" }, { value: "kgf", label: "kgf" }, { value: "lbf", label: "lbf" },
    ],
    technologies: [
      { value: "strain gauge", label: "Strain Gauge" },
      { value: "piezoelectric", label: "Piezoelectric" },
      { value: "hydraulic", label: "Hydraulic" },
      { value: "pneumatic", label: "Pneumatic" },
      { value: "optical", label: "Optical" },
    ],
  },
  {
    value: "torque", label: "Torque",
    units: [
      { value: "Nm", label: "N·m" }, { value: "kNm", label: "kN·m" }, { value: "lbf·ft", label: "lbf·ft" },
    ],
    technologies: [
      { value: "strain gauge", label: "Strain Gauge" },
      { value: "magnetoelastic", label: "Magnetoelastic" },
      { value: "optical", label: "Optical" },
      { value: "piezoelectric", label: "Piezoelectric" },
    ],
  },
  {
    value: "mass", label: "Mass",
    units: [
      { value: "kg", label: "kg" }, { value: "g", label: "g" }, { value: "mg", label: "mg" }, { value: "lb", label: "lb" },
    ],
    technologies: [
      { value: "strain gauge", label: "Strain Gauge" },
      { value: "electromagnetic force restoration", label: "Electromagnetic Force Restoration" },
      { value: "vibrating tube", label: "Vibrating Tube" },
      { value: "piezoelectric", label: "Piezoelectric" },
    ],
  },
  {
    value: "strain", label: "Strain",
    units: [{ value: "µε", label: "µε" }, { value: "m/m", label: "m/m" }],
    technologies: [
      { value: "foil strain gauge", label: "Foil Strain Gauge" },
      { value: "semiconductor strain gauge", label: "Semiconductor Strain Gauge" },
      { value: "fiber Bragg grating", label: "Fiber Bragg Grating" },
      { value: "capacitive", label: "Capacitive" },
    ],
  },
  {
    value: "displacement", label: "Displacement",
    units: [
      { value: "nm", label: "nm" }, { value: "µm", label: "µm" }, { value: "mm", label: "mm" },
      { value: "cm", label: "cm" }, { value: "m", label: "m" }, { value: "in", label: "in" }, { value: "ft", label: "ft" },
    ],
    technologies: [
      { value: "potentiometric", label: "Potentiometric" },
      { value: "LVDT", label: "LVDT" },
      { value: "inductive", label: "Inductive" },
      { value: "capacitive", label: "Capacitive" },
      { value: "eddy current", label: "Eddy Current" },
      { value: "laser", label: "Laser" },
      { value: "optical encoder", label: "Optical Encoder" },
      { value: "magnetostrictive", label: "Magnetostrictive" },
    ],
  },
  {
    value: "angle", label: "Angle",
    units: [{ value: "°", label: "°" }, { value: "rad", label: "rad" }],
    technologies: [
      { value: "potentiometer", label: "Potentiometer" },
      { value: "optical encoder", label: "Optical Encoder" },
      { value: "magnetic encoder", label: "Magnetic Encoder" },
      { value: "resolver", label: "Resolver" },
      { value: "inclinometer", label: "Inclinometer" },
      { value: "MEMS", label: "MEMS" },
    ],
  },
  {
    value: "angular_velocity", label: "Angular Velocity",
    units: [{ value: "rpm", label: "rpm" }, { value: "°/s", label: "°/s" }, { value: "rad/s", label: "rad/s" }],
    technologies: [
      { value: "optical encoder", label: "Optical Encoder" },
      { value: "hall effect", label: "Hall Effect" },
      { value: "magnetoresistive", label: "Magnetoresistive" },
      { value: "tachometer", label: "Tachometer" },
      { value: "MEMS gyroscope", label: "MEMS Gyroscope" },
    ],
  },
  {
    value: "angular_acceleration", label: "Angular Acceleration",
    units: [{ value: "°/s²", label: "°/s²" }, { value: "rad/s²", label: "rad/s²" }],
    technologies: [
      { value: "MEMS gyroscope", label: "MEMS Gyroscope" },
      { value: "optical encoder derivative", label: "Optical Encoder (derivative)" },
    ],
  },
  {
    value: "velocity", label: "Velocity",
    units: [
      { value: "mm/s", label: "mm/s" }, { value: "m/s", label: "m/s" }, { value: "km/h", label: "km/h" },
      { value: "mph", label: "mph" }, { value: "knots", label: "knots" },
    ],
    technologies: [
      { value: "Doppler radar", label: "Doppler Radar" },
      { value: "laser Doppler", label: "Laser Doppler" },
      { value: "encoder based", label: "Encoder Based" },
      { value: "pitot tube", label: "Pitot Tube" },
      { value: "ultrasonic", label: "Ultrasonic" },
    ],
  },
  {
    value: "acceleration", label: "Acceleration",
    units: [{ value: "m/s²", label: "m/s²" }, { value: "g", label: "g" }],
    technologies: [
      { value: "MEMS", label: "MEMS" },
      { value: "piezoelectric", label: "Piezoelectric" },
      { value: "piezoresistive", label: "Piezoresistive" },
      { value: "capacitive", label: "Capacitive" },
      { value: "servo accelerometer", label: "Servo Accelerometer" },
    ],
  },
  {
    value: "sound_pressure", label: "Sound Pressure",
    units: [
      { value: "Pa", label: "Pa" }, { value: "dB", label: "dB" }, { value: "dBA", label: "dB(A)" }, { value: "dBC", label: "dB(C)" },
    ],
    technologies: [
      { value: "condenser microphone", label: "Condenser Microphone" },
      { value: "piezoelectric microphone", label: "Piezoelectric Microphone" },
      { value: "MEMS microphone", label: "MEMS Microphone" },
    ],
  },
  {
    value: "voltage", label: "Voltage",
    units: [{ value: "V", label: "V" }, { value: "mV", label: "mV" }, { value: "kV", label: "kV" }],
    technologies: [
      { value: "resistive divider", label: "Resistive Divider" },
      { value: "capacitive divider", label: "Capacitive Divider" },
      { value: "hall effect", label: "Hall Effect" },
      { value: "isolation amplifier", label: "Isolation Amplifier" },
    ],
  },
  {
    value: "current", label: "Current",
    units: [{ value: "A", label: "A" }, { value: "mA", label: "mA" }, { value: "kA", label: "kA" }],
    technologies: [
      { value: "shunt resistor", label: "Shunt Resistor" },
      { value: "hall effect", label: "Hall Effect" },
      { value: "current transformer", label: "Current Transformer" },
      { value: "rogowski coil", label: "Rogowski Coil" },
    ],
  },
  {
    value: "resistance", label: "Resistance",
    units: [{ value: "Ω", label: "Ω" }, { value: "kΩ", label: "kΩ" }, { value: "MΩ", label: "MΩ" }],
    technologies: [
      { value: "two wire", label: "2-Wire" },
      { value: "three wire", label: "3-Wire" },
      { value: "four wire", label: "4-Wire" },
      { value: "bridge measurement", label: "Bridge Measurement" },
    ],
  },
  {
    value: "power", label: "Power",
    units: [{ value: "W", label: "W" }, { value: "kW", label: "kW" }, { value: "MW", label: "MW" }],
    technologies: [
      { value: "wattmeter", label: "Wattmeter" },
      { value: "power analyzer", label: "Power Analyzer" },
      { value: "calculated voltage current", label: "Calculated (V×I)" },
    ],
  },
  {
    value: "energy", label: "Energy",
    units: [{ value: "Wh", label: "Wh" }, { value: "kWh", label: "kWh" }, { value: "MWh", label: "MWh" }],
    technologies: [
      { value: "energy meter", label: "Energy Meter" },
      { value: "smart meter", label: "Smart Meter" },
    ],
  },
  {
    value: "frequency", label: "Frequency",
    units: [
      { value: "Hz", label: "Hz" }, { value: "kHz", label: "kHz" }, { value: "MHz", label: "MHz" },
      { value: "GHz", label: "GHz" }, { value: "bpm", label: "bpm" },
    ],
    technologies: [
      { value: "crystal counter", label: "Crystal Counter" },
      { value: "reciprocal counter", label: "Reciprocal Counter" },
      { value: "optical", label: "Optical" },
      { value: "magnetic pickup", label: "Magnetic Pickup" },
    ],
  },
  {
    value: "capacitance", label: "Capacitance",
    units: [{ value: "F", label: "F" }, { value: "µF", label: "µF" }, { value: "nF", label: "nF" }, { value: "pF", label: "pF" }],
    technologies: [
      { value: "bridge", label: "Bridge" },
      { value: "charge discharge", label: "Charge/Discharge" },
      { value: "resonant", label: "Resonant" },
    ],
  },
  {
    value: "inductance", label: "Inductance",
    units: [{ value: "H", label: "H" }, { value: "mH", label: "mH" }, { value: "µH", label: "µH" }],
    technologies: [
      { value: "bridge", label: "Bridge" },
      { value: "resonant", label: "Resonant" },
      { value: "impedance based", label: "Impedance Based" },
    ],
  },
  {
    value: "impedance", label: "Impedance",
    units: [{ value: "Ω", label: "Ω" }, { value: "kΩ", label: "kΩ" }, { value: "MΩ", label: "MΩ" }],
    technologies: [
      { value: "impedance analyzer", label: "Impedance Analyzer" },
      { value: "LCR meter", label: "LCR Meter" },
    ],
  },
  {
    value: "magnetic_field", label: "Magnetic Field",
    units: [{ value: "T", label: "T" }, { value: "mT", label: "mT" }, { value: "µT", label: "µT" }, { value: "G", label: "G" }],
    technologies: [
      { value: "hall effect", label: "Hall Effect" },
      { value: "fluxgate", label: "Fluxgate" },
      { value: "magnetoresistive", label: "Magnetoresistive" },
      { value: "NMR", label: "NMR" },
      { value: "SQUID", label: "SQUID" },
    ],
  },
  {
    value: "electric_field", label: "Electric Field",
    units: [{ value: "V/m", label: "V/m" }, { value: "kV/m", label: "kV/m" }],
    technologies: [
      { value: "field mill", label: "Field Mill" },
      { value: "electrostatic probe", label: "Electrostatic Probe" },
      { value: "capacitive probe", label: "Capacitive Probe" },
    ],
  },
  {
    value: "radiation", label: "Radiation",
    units: [
      { value: "Gy", label: "Gy" }, { value: "Sv", label: "Sv" }, { value: "rem", label: "rem" }, { value: "Bq", label: "Bq" },
    ],
    technologies: [
      { value: "Geiger-Muller", label: "Geiger-Müller" },
      { value: "scintillation", label: "Scintillation" },
      { value: "semiconductor", label: "Semiconductor" },
      { value: "ionization chamber", label: "Ionization Chamber" },
      { value: "proportional counter", label: "Proportional Counter" },
    ],
  },
  {
    value: "illuminance", label: "Illuminance",
    units: [{ value: "lx", label: "lx" }, { value: "fc", label: "fc" }],
    technologies: [
      { value: "photodiode", label: "Photodiode" },
      { value: "photoresistor", label: "Photoresistor" },
      { value: "lux meter", label: "Lux Meter" },
    ],
  },
  {
    value: "luminance", label: "Luminance",
    units: [{ value: "cd/m²", label: "cd/m²" }],
    technologies: [
      { value: "imaging photometer", label: "Imaging Photometer" },
      { value: "spot photometer", label: "Spot Photometer" },
    ],
  },
  {
    value: "concentration", label: "Concentration",
    units: [
      { value: "ppm", label: "ppm" }, { value: "ppb", label: "ppb" },
      { value: "%", label: "%" }, { value: "mg/m³", label: "mg/m³" },
    ],
    technologies: [
      { value: "electrochemical", label: "Electrochemical" },
      { value: "NDIR", label: "NDIR" },
      { value: "PID", label: "PID" },
      { value: "MOS", label: "MOS" },
      { value: "catalytic bead", label: "Catalytic Bead" },
      { value: "zirconia", label: "Zirconia" },
      { value: "mass spectrometer", label: "Mass Spectrometer" },
    ],
  },
  {
    value: "pH", label: "pH",
    units: [{ value: "pH", label: "pH" }],
    technologies: [
      { value: "glass electrode", label: "Glass Electrode" },
      { value: "ISFET", label: "ISFET" },
      { value: "optical", label: "Optical" },
    ],
  },
  {
    value: "conductivity", label: "Conductivity",
    units: [{ value: "S/m", label: "S/m" }, { value: "mS/cm", label: "mS/cm" }, { value: "µS/cm", label: "µS/cm" }],
    technologies: [
      { value: "contacting", label: "Contacting" },
      { value: "inductive", label: "Inductive" },
      { value: "toroidal", label: "Toroidal" },
    ],
  },
  {
    value: "salinity", label: "Salinity",
    units: [{ value: "ppt", label: "ppt" }, { value: "PSU", label: "PSU" }, { value: "g/L", label: "g/L" }],
    technologies: [
      { value: "conductivity based", label: "Conductivity Based" },
      { value: "refractometer", label: "Refractometer" },
    ],
  },
  {
    value: "dissolved_oxygen", label: "Dissolved Oxygen",
    units: [{ value: "mg/L", label: "mg/L" }, { value: "%sat", label: "% sat" }],
    technologies: [
      { value: "galvanic", label: "Galvanic" },
      { value: "polarographic", label: "Polarographic" },
      { value: "optical luminescent", label: "Optical / Luminescent" },
    ],
  },
  {
    value: "oxidation_reduction_potential", label: "ORP / Redox Potential",
    units: [{ value: "mV", label: "mV" }],
    technologies: [
      { value: "platinum electrode", label: "Platinum Electrode" },
      { value: "gold electrode", label: "Gold Electrode" },
    ],
  },
  {
    value: "density", label: "Density",
    units: [{ value: "kg/m³", label: "kg/m³" }, { value: "g/cm³", label: "g/cm³" }],
    technologies: [
      { value: "vibrating tube", label: "Vibrating Tube" },
      { value: "hydrostatic", label: "Hydrostatic" },
      { value: "coriolis", label: "Coriolis" },
      { value: "pycnometer", label: "Pycnometer" },
    ],
  },
  {
    value: "viscosity", label: "Viscosity",
    units: [{ value: "Pa·s", label: "Pa·s" }, { value: "cP", label: "cP" }],
    technologies: [
      { value: "rotational", label: "Rotational" },
      { value: "vibrational", label: "Vibrational" },
      { value: "capillary", label: "Capillary" },
      { value: "falling ball", label: "Falling Ball" },
    ],
  },
  {
    value: "moisture", label: "Moisture",
    units: [{ value: "%RH", label: "%RH" }, { value: "%", label: "%" }, { value: "g/g", label: "g/g" }],
    technologies: [
      { value: "capacitive", label: "Capacitive" },
      { value: "microwave", label: "Microwave" },
      { value: "infrared", label: "Infrared" },
      { value: "gravimetric", label: "Gravimetric" },
    ],
  },
  {
    value: "particle_concentration", label: "Particle Concentration",
    units: [{ value: "particles/m³", label: "particles/m³" }, { value: "particles/ft³", label: "particles/ft³" }],
    technologies: [
      { value: "optical particle counter", label: "Optical Particle Counter" },
      { value: "laser scattering", label: "Laser Scattering" },
      { value: "condensation particle counter", label: "Condensation Particle Counter" },
    ],
  },
  {
    value: "wind_direction", label: "Wind Direction",
    units: [{ value: "°", label: "°" }],
    technologies: [
      { value: "vane", label: "Vane" },
      { value: "ultrasonic", label: "Ultrasonic" },
    ],
  },
  {
    value: "precipitation", label: "Precipitation",
    units: [{ value: "mm", label: "mm" }, { value: "in", label: "in" }],
    technologies: [
      { value: "tipping bucket", label: "Tipping Bucket" },
      { value: "weighing", label: "Weighing" },
      { value: "optical", label: "Optical" },
    ],
  },
  {
    value: "blood_oxygen", label: "Blood Oxygen",
    units: [{ value: "%SpO2", label: "% SpO₂" }],
    technologies: [
      { value: "pulse oximetry", label: "Pulse Oximetry" },
    ],
  },
  {
    value: "surface_roughness", label: "Surface Roughness",
    units: [
      { value: "Ra", label: "Ra (µm)" }, { value: "Rz", label: "Rz (µm)" },
      { value: "Rt", label: "Rt (µm)" }, { value: "µm", label: "µm" },
    ],
    technologies: [
      { value: "contact profilometer", label: "Contact Profilometer" },
      { value: "optical profilometer", label: "Optical Profilometer" },
      { value: "laser scanning", label: "Laser Scanning" },
    ],
  },
];

// Lookup helpers
export const QUANTITY_MAP = new Map(PHYSICAL_QUANTITIES.map(q => [q.value, q]));

export function getUnitsForQuantity(quantity: string): UnitOption[] {
  return QUANTITY_MAP.get(quantity)?.units ?? [];
}

// ---------------------------------------------------------------------------
// Measurement type (e.g. absolute vs. gauge pressure)
// ---------------------------------------------------------------------------

export interface QuantityTypeOption {
  value: string;
  label: string;
}

/**
 * Measurement-mode options for physical quantities that need one. Quantities
 * not listed here have no "Measurement type" field shown at all.
 */
export const PHYSICAL_QUANTITY_TYPES: Record<string, QuantityTypeOption[]> = {
  pressure: [
    { value: "absolute", label: "Absolute" },
    { value: "gauge", label: "Gauge (relative)" },
  ],
};

export function getTypesForQuantity(quantity: string): QuantityTypeOption[] {
  return PHYSICAL_QUANTITY_TYPES[quantity] ?? [];
}

// ---------------------------------------------------------------------------
// "% of Full Scale" as a unit option for accuracy/resolution/uncertainty
// ---------------------------------------------------------------------------

/** Sentinel unit value representing "% of full scale". */
export const PERCENT_FS_UNIT = "%FS";

function hasRange(
  rangeMin: string | number | null | undefined,
  rangeMax: string | number | null | undefined,
): boolean {
  return rangeMin !== null && rangeMin !== undefined && rangeMin !== "" &&
    rangeMax !== null && rangeMax !== undefined && rangeMax !== "";
}

/**
 * Unit options for an accuracy/resolution/uncertainty spec: the quantity's own
 * compatible units, plus "% FS" first — but only once a measurement range
 * (min and max) has been entered, since %FS is meaningless without one.
 */
export function getSpecUnitOptions(
  quantity: string,
  rangeMin: string | number | null | undefined,
  rangeMax: string | number | null | undefined,
): UnitOption[] {
  const units = getUnitsForQuantity(quantity);
  return hasRange(rangeMin, rangeMax)
    ? [{ value: PERCENT_FS_UNIT, label: "% FS" }, ...units]
    : units;
}

/**
 * Resolve a stored spec value (accuracy/resolution/uncertainty) to an absolute
 * value in the quantity's own unit, converting from %FS if that's what was
 * selected. Returns null if conversion is needed but the range isn't available.
 */
export function resolveSpecValue(
  value: number | null | undefined,
  unit: string | null | undefined,
  rangeMin: number | null | undefined,
  rangeMax: number | null | undefined,
): number | null {
  if (value == null) return null;
  if (unit !== PERCENT_FS_UNIT) return value;
  if (rangeMin == null || rangeMax == null) return null;
  return (value / 100) * (rangeMax - rangeMin);
}

export function getTechsForQuantity(quantity: string): TechFamilyOption[] {
  return QUANTITY_MAP.get(quantity)?.technologies ?? [];
}

/** Given a stored technology string, find the family option and subtype option */
export function parseTechnology(
  quantity: string,
  technology: string,
): { family: string; subtype: string } {
  const techs = getTechsForQuantity(quantity);
  for (const t of techs) {
    if (!t.subtypes) {
      if (t.value === technology) return { family: t.value, subtype: "" };
    } else {
      for (const s of t.subtypes) {
        if (s.value === technology) return { family: t.value, subtype: s.value };
      }
    }
  }
  // Not found — treat as custom
  return { family: "__other__", subtype: technology };
}

// Fixed select options for other fields
export const MOUNTING_TYPE_OPTIONS = [
  { value: "wall", label: "Wall" },
  { value: "ceiling", label: "Ceiling" },
  { value: "pole", label: "Pole" },
  { value: "din rail", label: "DIN Rail" },
];

export const IP_RATING_OPTIONS = [
  { value: "IP65", label: "IP65" },
  { value: "IP66", label: "IP66" },
  { value: "IP67", label: "IP67" },
  { value: "IP68", label: "IP68" },
];

export const HAZARDOUS_AREA_OPTIONS = [
  { value: "Zone 0", label: "Zone 0" },
  { value: "Zone 1", label: "Zone 1" },
  { value: "Zone 2", label: "Zone 2" },
  { value: "non-hazardous", label: "Non-Hazardous" },
];

export const CAL_ROLE_OPTIONS = [
  { value: "working", label: "Working" },
  { value: "reference", label: "Reference" },
  { value: "transfer", label: "Transfer" },
];

export const OUTPUT_TYPE_OPTIONS = [
  { value: "analog", label: "Analog" },
  { value: "digital", label: "Digital" },
  { value: "frequency", label: "Frequency" },
  { value: "resistance", label: "Resistance" },
  { value: "capacitance", label: "Capacitance" },
];

export const ACCURACY_TYPE_OPTIONS = [
  { value: "percent_of_reading", label: "% of Reading" },
  { value: "percent_of_full_scale", label: "% of Full Scale" },
  { value: "absolute", label: "Absolute" },
];

export const CRITICALITY_OPTIONS = [
  { value: "non-critical", label: "Non-Critical" },
  { value: "critical", label: "Critical" },
  { value: "safety-critical", label: "Safety-Critical" },
];

export const ANALOG_OUTPUT_UNITS: UnitOption[] = [
  { value: "mA", label: "mA" },
  { value: "A", label: "A" },
  { value: "V", label: "V" },
  { value: "mV", label: "mV" },
  { value: "kV", label: "kV" },
];

export const FREQUENCY_OUTPUT_UNITS: UnitOption[] = [
  { value: "Hz", label: "Hz" },
  { value: "kHz", label: "kHz" },
  { value: "MHz", label: "MHz" },
  { value: "GHz", label: "GHz" },
];

export const RESISTANCE_OUTPUT_UNITS: UnitOption[] = [
  { value: "Ω", label: "Ω" },
  { value: "kΩ", label: "kΩ" },
  { value: "MΩ", label: "MΩ" },
];

export const CAPACITANCE_OUTPUT_UNITS: UnitOption[] = [
  { value: "F", label: "F" },
  { value: "µF", label: "µF" },
  { value: "nF", label: "nF" },
  { value: "pF", label: "pF" },
];

export function getOutputUnits(outputType: string, physicalQuantity: string): UnitOption[] | null {
  switch (outputType) {
    case "analog":
      return ANALOG_OUTPUT_UNITS;
    case "digital": {
      const qty = QUANTITY_MAP.get(physicalQuantity);
      return qty?.units ?? null;
    }
    case "frequency":
      return FREQUENCY_OUTPUT_UNITS;
    case "resistance":
      return RESISTANCE_OUTPUT_UNITS;
    case "capacitance":
      return CAPACITANCE_OUTPUT_UNITS;
    default:
      return null;
  }
}
