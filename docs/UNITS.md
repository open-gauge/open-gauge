All stored units on the database are in SI units, and the user can select the unit to display on the UI. The following units are supported:

- temperature
    SI unit: K

    °C → K = °C + 273.15
    °F → K = (°F - 32) × 5/9 + 273.15

- pressure
    SI unit: Pa

    kPa → Pa = kPa × 1 000
    MPa → Pa = MPa × 1 000 000
    bar → Pa = bar × 100 000
    psi → Pa = psi × 6 894.757
    hPa → Pa = hPa × 100
    atm → Pa = atm × 101 325
    mmHg → Pa = mmHg × 133.322
    inHg → Pa = inHg × 3 386.389
    inH2O → Pa = inH2O × 249.0889

- flow (volumetric)
    SI unit: m³/s

    m³/h → m³/s = value / 3 600
    L/min → m³/s = value / 60 000
    gal/min (US) → m³/s = value × 6.309×10⁻⁵

- flow (mass)
    SI unit: kg/s

    kg/h → kg/s = value / 3 600
    g/min → kg/s = value / 60 000
    lb/min → kg/s = value × 0.00755987

- level
    SI unit: m

    mm → m = value / 1 000
    cm → m = value / 100
    in → m = value × 0.0254
    ft → m = value × 0.3048
    % → application dependent

- humidity
    SI unit: %RH

    g/m³ → no universal conversion
    dew point → requires psychrometric calculation

- force
    SI unit: N

    kN → N = value × 1 000
    kgf → N = value × 9.80665
    lbf → N = value × 4.44822

- torque
    SI unit: N·m

    kgf·m → N·m = value × 9.80665
    lbf·ft → N·m = value × 1.35582

- mass
    SI unit: kg

    g → kg = value / 1 000
    mg → kg = value / 1 000 000
    lb → kg = value × 0.45359237

- strain
    SI unit: m/m

    µε → m/m = value × 10⁻⁶

- displacement
    SI unit: m

    nm → m = value × 10⁻⁹
    µm → m = value × 10⁻⁶
    mm → m = value × 10⁻³
    cm → m = value × 10⁻²
    in → m = value × 0.0254
    ft → m = value × 0.3048

- angle
    SI unit: rad

    ° → rad = value × π / 180

- angular_velocity
    SI unit: rad/s

    rpm → rad/s = rpm × 2π / 60
    °/s → rad/s = value × π / 180

- angular_acceleration
    SI unit: rad/s²

    °/s² → rad/s² = value × π / 180

- velocity
    SI unit: m/s

    km/h → m/s = value / 3.6
    mph → m/s = value × 0.44704
    knots → m/s = value × 0.514444

- acceleration
    SI unit: m/s²

    g → m/s² = value × 9.80665

- sound_pressure
    SI unit: Pa

    dB, dBA, dBC are logarithmic scales
    Cannot be converted directly without reference pressure

- voltage
    SI unit: V

    mV → V = value / 1 000
    kV → V = value × 1 000

- current
    SI unit: A

    mA → A = value / 1 000
    kA → A = value × 1 000

- resistance
    SI unit: Ω

    kΩ → Ω = value × 1 000
    MΩ → Ω = value × 1 000 000

- power
    SI unit: W

    kW → W = value × 1 000
    MW → W = value × 1 000 000

- energy
    SI unit: J

    Wh → J = value × 3 600
    kWh → J = value × 3 600 000
    MWh → J = value × 3 600 000 000

- frequency
    SI unit: Hz

    kHz → Hz = value × 1 000
    MHz → Hz = value × 1 000 000
    GHz → Hz = value × 1 000 000 000
    bpm → Hz = bpm / 60

- capacitance
    SI unit: F

    µF → F = value × 10⁻⁶
    nF → F = value × 10⁻⁹
    pF → F = value × 10⁻¹²

- inductance
    SI unit: H

    mH → H = value × 10⁻³
    µH → H = value × 10⁻⁶

- impedance
    SI unit: Ω

    kΩ → Ω = value × 1 000
    MΩ → Ω = value × 1 000 000

- magnetic_field
    SI unit: T

    mT → T = value × 10⁻³
    µT → T = value × 10⁻⁶
    G → T = value × 10⁻⁴

- electric_field
    SI unit: V/m

    kV/m → V/m = value × 1 000

- radiation
    SI unit: Gy (absorbed dose)

    Sv = equivalent dose (not directly convertible)
    rem → Sv = rem × 0.01
    Bq = activity (different quantity)

- illuminance
    SI unit: lx

    foot-candle → lx = value × 10.7639

- luminance
    SI unit: cd/m²

- concentration
    SI unit: mol/m³

    ppm, ppb, %, mg/m³ depend on substance
    Conversion requires molecular weight and conditions

- pH
    SI unit: dimensionless

- conductivity
    SI unit: S/m

    mS/cm → S/m = value × 0.1
    µS/cm → S/m = value × 0.0001

- salinity
    SI unit: kg/m³

    g/L → kg/m³ = numerically identical

- dissolved_oxygen
    SI unit: mg/L

    % saturation requires temperature and pressure

- oxidation_reduction_potential
    SI unit: V

    mV → V = value / 1 000

- density
    SI unit: kg/m³

    g/cm³ → kg/m³ = value × 1 000

- viscosity
    SI unit: Pa·s

    cP → Pa·s = value × 0.001

- moisture
    SI unit: kg/kg

    % → kg/kg = value / 100

- particle_concentration
    SI unit: particles/m³

    particles/ft³ → particles/m³ = value × 35.3147

- wind_direction
    SI unit: rad

    ° → rad = value × π / 180

- precipitation
    SI unit: m

    mm → m = value / 1 000
    in → m = value × 0.0254

- blood_oxygen
    SI unit: %

- surface_roughness
    SI unit: m

    µm → m = value × 10⁻⁶