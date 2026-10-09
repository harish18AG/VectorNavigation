"""
VectorNav — Mathematical Calculation Engine
============================================
Centralized module for all vector calculus computations used in
GPS navigation analysis.

Formulas implemented:
  - Position Vector:   r(t) = x(t)i + y(t)j + z(t)k
  - Distance:          d = sqrt((x2-x1)^2 + (y2-y1)^2 + (z2-z1)^2)
  - Velocity:          v = dr/dt  ≈  Δr/Δt
  - Speed:             |v| = sqrt(vx^2 + vy^2 + vz^2)
  - Acceleration:      a = dv/dt  ≈  Δv/Δt
  - Direction unit:    u = v / |v|
  - Gradient:          ∇f  (numerical, scalar field)
  - Divergence:        ∇ · F  (numerical, vector field)
  - Curl:              ∇ × F  (numerical, vector field)
  - Line Integral:     ∫C F · dr
  - GPS Error:         Error = sqrt((Δx)^2 + (Δy)^2 + (Δz)^2)
  - Route Cost:        Cost = w1*dist + w2*time + w3*error
"""

import math
import random


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
EARTH_RADIUS_M = 6_371_000.0   # metres
DEG_TO_RAD     = math.pi / 180.0


# ---------------------------------------------------------------------------
# 1. Coordinate Conversions
# ---------------------------------------------------------------------------

def lat_lon_to_ecef(lat_deg: float, lon_deg: float, alt_m: float = 0.0) -> dict:
    """
    Convert geodetic coordinates (latitude, longitude, altitude)
    to Earth-Centred Earth-Fixed (ECEF) Cartesian coordinates in metres.

    WGS-84 ellipsoid parameters:
        a = 6 378 137.0 m   (semi-major axis)
        f = 1 / 298.257223563
        b = a * (1 - f)
        e² = 2f - f²

    Returns:
        dict with keys: x, y, z (all in metres)
    """
    a     = 6_378_137.0
    f     = 1.0 / 298.257223563
    e_sq  = 2 * f - f * f

    lat   = lat_deg * DEG_TO_RAD
    lon   = lon_deg * DEG_TO_RAD

    N = a / math.sqrt(1 - e_sq * math.sin(lat) ** 2)   # prime vertical radius

    x = (N + alt_m) * math.cos(lat) * math.cos(lon)
    y = (N + alt_m) * math.cos(lat) * math.sin(lon)
    z = (N * (1 - e_sq) + alt_m) * math.sin(lat)

    return {"x": round(x, 3), "y": round(y, 3), "z": round(z, 3)}


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great-circle distance between two points on Earth
    using the Haversine formula.  Returns distance in metres.
    """
    phi1 = lat1 * DEG_TO_RAD
    phi2 = lat2 * DEG_TO_RAD
    dphi = (lat2 - lat1) * DEG_TO_RAD
    dlam = (lon2 - lon1) * DEG_TO_RAD

    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return EARTH_RADIUS_M * c   # metres


# ---------------------------------------------------------------------------
# 2. Position Vector
# ---------------------------------------------------------------------------

def calculate_position_vector(lat: float, lon: float, alt: float = 0.0) -> dict:
    """
    Represent GPS position as a position vector r(t) = xi + yj + zk
    using ECEF coordinates, and also keep the geodetic values.

    Returns full position-vector information for display.
    """
    ecef = lat_lon_to_ecef(lat, lon, alt)
    magnitude = math.sqrt(ecef["x"]**2 + ecef["y"]**2 + ecef["z"]**2)

    return {
        "latitude":  lat,
        "longitude": lon,
        "altitude":  alt,
        "x":         ecef["x"],
        "y":         ecef["y"],
        "z":         ecef["z"],
        "magnitude": round(magnitude, 3),
        "vector_str": f"r(t) = {ecef['x']:.1f}î + {ecef['y']:.1f}ĵ + {ecef['z']:.1f}k̂  (metres)"
    }


# ---------------------------------------------------------------------------
# 3. Distance Calculation
# ---------------------------------------------------------------------------

def calculate_distance(lat1: float, lon1: float, alt1: float,
                        lat2: float, lon2: float, alt2: float) -> dict:
    """
    Calculate distance between two GPS positions using:
      1. ECEF Euclidean 3-D formula  d = sqrt(Δx²+Δy²+Δz²)
      2. Haversine surface distance

    Returns step-by-step calculation details.
    """
    p1 = lat_lon_to_ecef(lat1, lon1, alt1)
    p2 = lat_lon_to_ecef(lat2, lon2, alt2)

    dx = p2["x"] - p1["x"]
    dy = p2["y"] - p1["y"]
    dz = p2["z"] - p1["z"]

    dist_3d   = math.sqrt(dx**2 + dy**2 + dz**2)
    dist_hav  = haversine_distance(lat1, lon1, lat2, lon2)

    return {
        "p1":           {"lat": lat1, "lon": lon1, "alt": alt1, **p1},
        "p2":           {"lat": lat2, "lon": lon2, "alt": alt2, **p2},
        "delta_x":      round(dx, 3),
        "delta_y":      round(dy, 3),
        "delta_z":      round(dz, 3),
        "dx_sq":        round(dx**2, 3),
        "dy_sq":        round(dy**2, 3),
        "dz_sq":        round(dz**2, 3),
        "sum_sq":       round(dx**2 + dy**2 + dz**2, 3),
        "distance_3d_m":  round(dist_3d, 3),
        "distance_hav_m": round(dist_hav, 3),
        "distance_km":    round(dist_hav / 1000, 4),
    }


# ---------------------------------------------------------------------------
# 4. Velocity
# ---------------------------------------------------------------------------

def calculate_velocity(lat1: float, lon1: float, alt1: float, t1: float,
                        lat2: float, lon2: float, alt2: float, t2: float) -> dict:
    """
    Velocity vector  v = dr/dt  ≈  Δr / Δt

    Δr is computed in ECEF metres.  Δt in seconds.

    Returns vx, vy, vz in m/s and the speed (magnitude) in m/s and km/h.
    """
    dt = t2 - t1
    if abs(dt) < 1e-9:
        return {"error": "Time difference is zero — cannot compute velocity"}

    p1 = lat_lon_to_ecef(lat1, lon1, alt1)
    p2 = lat_lon_to_ecef(lat2, lon2, alt2)

    dx = p2["x"] - p1["x"]
    dy = p2["y"] - p1["y"]
    dz = p2["z"] - p1["z"]

    vx = dx / dt
    vy = dy / dt
    vz = dz / dt

    speed_ms  = math.sqrt(vx**2 + vy**2 + vz**2)
    speed_kmh = speed_ms * 3.6

    return {
        "delta_r": {"dx": round(dx, 3), "dy": round(dy, 3), "dz": round(dz, 3)},
        "delta_t":  round(dt, 4),
        "vx":       round(vx, 4),
        "vy":       round(vy, 4),
        "vz":       round(vz, 4),
        "speed_ms":  round(speed_ms, 4),
        "speed_kmh": round(speed_kmh, 4),
    }


# ---------------------------------------------------------------------------
# 5. Speed
# ---------------------------------------------------------------------------

def calculate_speed(vx: float, vy: float, vz: float) -> dict:
    """
    |v| = sqrt(vx² + vy² + vz²)
    """
    speed_ms  = math.sqrt(vx**2 + vy**2 + vz**2)
    speed_kmh = speed_ms * 3.6

    return {
        "vx":        round(vx, 4),
        "vy":        round(vy, 4),
        "vz":        round(vz, 4),
        "vx_sq":     round(vx**2, 4),
        "vy_sq":     round(vy**2, 4),
        "vz_sq":     round(vz**2, 4),
        "sum_sq":    round(vx**2 + vy**2 + vz**2, 4),
        "speed_ms":  round(speed_ms, 4),
        "speed_kmh": round(speed_kmh, 4),
    }


# ---------------------------------------------------------------------------
# 6. Acceleration
# ---------------------------------------------------------------------------

def calculate_acceleration(vx1: float, vy1: float, vz1: float, t1: float,
                             vx2: float, vy2: float, vz2: float, t2: float) -> dict:
    """
    Acceleration  a = dv/dt  ≈  Δv / Δt

    Returns ax, ay, az in m/s² and the acceleration magnitude.
    """
    dt = t2 - t1
    if abs(dt) < 1e-9:
        return {"error": "Time difference is zero — cannot compute acceleration"}

    dvx = vx2 - vx1
    dvy = vy2 - vy1
    dvz = vz2 - vz1

    ax = dvx / dt
    ay = dvy / dt
    az = dvz / dt

    acc_mag = math.sqrt(ax**2 + ay**2 + az**2)

    return {
        "delta_v": {"dvx": round(dvx, 4), "dvy": round(dvy, 4), "dvz": round(dvz, 4)},
        "delta_t":  round(dt, 4),
        "ax":       round(ax, 4),
        "ay":       round(ay, 4),
        "az":       round(az, 4),
        "acc_magnitude": round(acc_mag, 4),
    }


# ---------------------------------------------------------------------------
# 7. Direction / Heading
# ---------------------------------------------------------------------------

def calculate_direction(lat1: float, lon1: float, lat2: float, lon2: float) -> dict:
    """
    Calculate compass bearing from point 1 to point 2.

    Formula:
        θ = atan2(sin(Δλ)·cos(φ₂), cos(φ₁)·sin(φ₂) − sin(φ₁)·cos(φ₂)·cos(Δλ))

    Returns heading in degrees [0,360) and cardinal direction label.
    """
    phi1 = lat1 * DEG_TO_RAD
    phi2 = lat2 * DEG_TO_RAD
    dlam = (lon2 - lon1) * DEG_TO_RAD

    x = math.sin(dlam) * math.cos(phi2)
    y = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlam)

    bearing_rad = math.atan2(x, y)
    bearing_deg = (bearing_rad / DEG_TO_RAD + 360) % 360

    cardinal = _bearing_to_cardinal(bearing_deg)

    # Unit direction vector (2-D in lat/lon plane for display purposes)
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    mag  = math.sqrt(dlat**2 + dlon**2) or 1e-9

    return {
        "bearing_deg":  round(bearing_deg, 2),
        "cardinal":     cardinal,
        "unit_vector":  {"ux": round(dlon / mag, 4), "uy": round(dlat / mag, 4)},
    }


def _bearing_to_cardinal(bearing: float) -> str:
    directions = [
        "N", "NNE", "NE", "ENE",
        "E", "ESE", "SE", "SSE",
        "S", "SSW", "SW", "WSW",
        "W", "WNW", "NW", "NNW",
    ]
    idx = round(bearing / 22.5) % 16
    return directions[idx]


# ---------------------------------------------------------------------------
# 8. Gradient  ∇f
# ---------------------------------------------------------------------------

def calculate_gradient(f_values: list, dx: float = 1.0, dy: float = 1.0) -> dict:
    """
    Numerical gradient of a 2-D scalar field f using central differences.

    f_values: 3×3 grid (list of 3 lists, each with 3 values)
              arranged as f[row][col], row = y-axis, col = x-axis.

    Returns ∂f/∂x and ∂f/∂y at the central cell [1][1].
    """
    # Central differences at centre cell
    df_dx = (f_values[1][2] - f_values[1][0]) / (2 * dx)
    df_dy = (f_values[2][1] - f_values[0][1]) / (2 * dy)

    magnitude = math.sqrt(df_dx**2 + df_dy**2)

    return {
        "df_dx":     round(df_dx, 6),
        "df_dy":     round(df_dy, 6),
        "magnitude": round(magnitude, 6),
        "formula":   "∇f = (∂f/∂x)î + (∂f/∂y)ĵ",
    }


# ---------------------------------------------------------------------------
# 9. Divergence  ∇ · F
# ---------------------------------------------------------------------------

def calculate_divergence(Fx_grid: list, Fy_grid: list,
                          dx: float = 1.0, dy: float = 1.0) -> dict:
    """
    Numerical divergence of a 2-D vector field F = (Fx, Fy)
    using central differences at the central cell of 3×3 grids.

    ∇ · F = ∂Fx/∂x + ∂Fy/∂y
    """
    dFx_dx = (Fx_grid[1][2] - Fx_grid[1][0]) / (2 * dx)
    dFy_dy = (Fy_grid[2][1] - Fy_grid[0][1]) / (2 * dy)

    divergence = dFx_dx + dFy_dy

    return {
        "dFx_dx":    round(dFx_dx, 6),
        "dFy_dy":    round(dFy_dy, 6),
        "divergence": round(divergence, 6),
        "formula":   "∇·F = ∂Fx/∂x + ∂Fy/∂y",
    }


# ---------------------------------------------------------------------------
# 10. Curl  ∇ × F
# ---------------------------------------------------------------------------

def calculate_curl(Fx_grid: list, Fy_grid: list,
                   dx: float = 1.0, dy: float = 1.0) -> dict:
    """
    Numerical 2-D curl (z-component) of vector field F = (Fx, Fy).

    (∇ × F)_z = ∂Fy/∂x − ∂Fx/∂y
    """
    dFy_dx = (Fy_grid[1][2] - Fy_grid[1][0]) / (2 * dx)
    dFx_dy = (Fx_grid[2][1] - Fx_grid[0][1]) / (2 * dy)

    curl_z = dFy_dx - dFx_dy

    return {
        "dFy_dx":  round(dFy_dx, 6),
        "dFx_dy":  round(dFx_dy, 6),
        "curl_z":  round(curl_z, 6),
        "formula": "(∇×F)_z = ∂Fy/∂x − ∂Fx/∂y",
    }


# ---------------------------------------------------------------------------
# 11. Line Integral  ∫C F · dr
# ---------------------------------------------------------------------------

def calculate_line_integral(F_vectors: list, dr_vectors: list) -> dict:
    """
    Numerical line integral  ∫C F · dr

    F_vectors  : list of (Fx, Fy) tuples evaluated at each segment midpoint
    dr_vectors : list of (drx, dry) displacement vectors for each segment

    Returns the accumulated integral and per-segment contributions.
    """
    if len(F_vectors) != len(dr_vectors):
        return {"error": "F_vectors and dr_vectors must have the same length"}

    segments = []
    total    = 0.0

    for i, (F, dr) in enumerate(zip(F_vectors, dr_vectors)):
        dot = F[0] * dr[0] + F[1] * dr[1]
        segments.append({
            "segment":   i + 1,
            "Fx":        round(F[0],  4),
            "Fy":        round(F[1],  4),
            "drx":       round(dr[0], 4),
            "dry":       round(dr[1], 4),
            "F_dot_dr":  round(dot,   4),
        })
        total += dot

    return {
        "segments":       segments,
        "total_integral": round(total, 4),
        "formula":        "∫C F·dr = Σ F_i · Δr_i",
    }


# ---------------------------------------------------------------------------
# 12. GPS Error
# ---------------------------------------------------------------------------

def calculate_gps_error(ref_lat: float, ref_lon: float, ref_alt: float,
                         meas_lat: float, meas_lon: float, meas_alt: float) -> dict:
    """
    GPS Error = sqrt((Δx)² + (Δy)² + (Δz)²)  in ECEF metres.

    Also reports surface-distance error using Haversine.
    """
    ref  = lat_lon_to_ecef(ref_lat,  ref_lon,  ref_alt)
    meas = lat_lon_to_ecef(meas_lat, meas_lon, meas_alt)

    dx = meas["x"] - ref["x"]
    dy = meas["y"] - ref["y"]
    dz = meas["z"] - ref["z"]

    error_3d  = math.sqrt(dx**2 + dy**2 + dz**2)
    error_hav = haversine_distance(ref_lat, ref_lon, meas_lat, meas_lon)

    return {
        "reference":  {"lat": ref_lat,  "lon": ref_lon,  "alt": ref_alt,  **ref},
        "measured":   {"lat": meas_lat, "lon": meas_lon, "alt": meas_alt, **meas},
        "delta_x":    round(dx, 3),
        "delta_y":    round(dy, 3),
        "delta_z":    round(dz, 3),
        "error_3d_m": round(error_3d,  3),
        "error_hav_m":round(error_hav, 3),
        "formula":    "Error = √((Δx)² + (Δy)² + (Δz)²)",
    }


def simulate_gps_error(lat: float, lon: float, alt: float,
                        error_m: float, seed: int = None) -> dict:
    """
    Add a simulated GPS error of ≈error_m metres to a reference position.

    Strategy:
        Convert a random azimuth + the given radial error to Δlat / Δlon.
    """
    if seed is not None:
        random.seed(seed)

    azimuth = random.uniform(0, 2 * math.pi)   # random direction
    # 1 degree lat ≈ 111 319 m
    delta_lat = (error_m * math.cos(azimuth)) / 111_319.0
    delta_lon = (error_m * math.sin(azimuth)) / (111_319.0 * math.cos(lat * DEG_TO_RAD))

    meas_lat = lat + delta_lat
    meas_lon = lon + delta_lon

    error_info = calculate_gps_error(lat, lon, alt, meas_lat, meas_lon, alt)
    error_info["simulated_error_input_m"] = error_m
    error_info["azimuth_deg"] = round(math.degrees(azimuth) % 360, 2)

    return error_info


def correct_gps_position(ref_lat: float, ref_lon: float,
                          meas_lat: float, meas_lon: float,
                          correction_factor: float = 0.85) -> dict:
    """
    Simple weighted-mean correction model:
        corrected = measured + correction_factor × (reference − measured)

    In real DGPS/SBAS systems, error corrections are broadcast from
    reference stations.  This is an educational approximation.

    correction_factor = 0.85 means we correct 85 % of the error.
    """
    corr_lat = meas_lat + correction_factor * (ref_lat - meas_lat)
    corr_lon = meas_lon + correction_factor * (ref_lon - meas_lon)

    before_error = haversine_distance(ref_lat, ref_lon, meas_lat, meas_lon)
    after_error  = haversine_distance(ref_lat, ref_lon, corr_lat, corr_lon)
    improvement  = ((before_error - after_error) / before_error * 100) if before_error else 0

    return {
        "reference":         {"lat": ref_lat,  "lon": ref_lon},
        "measured":          {"lat": meas_lat, "lon": meas_lon},
        "corrected":         {"lat": round(corr_lat, 8), "lon": round(corr_lon, 8)},
        "correction_factor": correction_factor,
        "error_before_m":    round(before_error, 3),
        "error_after_m":     round(after_error, 3),
        "improvement_pct":   round(improvement, 2),
    }


# ---------------------------------------------------------------------------
# 13. Route Cost Function
# ---------------------------------------------------------------------------

def calculate_route_cost(distance_km: float, time_min: float, error_m: float,
                          w1: float = 0.5, w2: float = 0.3, w3: float = 0.2) -> dict:
    """
    Route Cost = w1·(normalised_distance) + w2·(normalised_time) + w3·(normalised_error)

    Weights w1, w2, w3 should sum to 1.0 (enforced by normalisation).
    Raw cost components are each normalised to [0, 1] relative to typical values:
        distance reference : 20 km
        time reference     : 60 min
        error reference    : 50 m
    """
    w_sum = w1 + w2 + w3 or 1.0
    w1, w2, w3 = w1 / w_sum, w2 / w_sum, w3 / w_sum   # normalise weights

    dist_norm  = min(distance_km / 20.0,   1.0)
    time_norm  = min(time_min    / 60.0,   1.0)
    error_norm = min(error_m     / 50.0,   1.0)

    cost_dist  = w1 * dist_norm
    cost_time  = w2 * time_norm
    cost_error = w3 * error_norm
    total_cost = cost_dist + cost_time + cost_error

    return {
        "distance_km":  distance_km,
        "time_min":     time_min,
        "error_m":      error_m,
        "w1":           round(w1, 4),
        "w2":           round(w2, 4),
        "w3":           round(w3, 4),
        "dist_norm":    round(dist_norm,  4),
        "time_norm":    round(time_norm,  4),
        "error_norm":   round(error_norm, 4),
        "cost_dist":    round(cost_dist,  4),
        "cost_time":    round(cost_time,  4),
        "cost_error":   round(cost_error, 4),
        "total_cost":   round(total_cost, 4),
        "formula":      "Cost = w₁·dist_norm + w₂·time_norm + w₃·error_norm",
    }


# ---------------------------------------------------------------------------
# 14. Demo Route Helper
# ---------------------------------------------------------------------------

def generate_demo_route_stats(route_label: str, base_dist_km: float,
                               avg_speed_kmh: float = 40.0,
                               error_m: float = 8.0) -> dict:
    """
    Generate consistent demo route statistics for Module 3 comparison.
    """
    time_min = (base_dist_km / avg_speed_kmh) * 60.0
    cost     = calculate_route_cost(base_dist_km, time_min, error_m)

    return {
        "label":         route_label,
        "distance_km":   round(base_dist_km, 2),
        "time_min":      round(time_min, 2),
        "avg_speed_kmh": avg_speed_kmh,
        "error_m":       error_m,
        "cost":          cost,
    }
