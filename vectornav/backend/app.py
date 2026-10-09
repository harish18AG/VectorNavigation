"""
VectorNav — Flask REST API
============================
Single-file Flask application that:
  1. Initialises the SQLite database on startup.
  2. Serves the frontend static files (from ../frontend/).
  3. Exposes REST API endpoints for all vector-calculus computations.

Run:
    cd backend
    python app.py

Then open http://localhost:5000 in your browser.
"""

import os
import math
import json
import urllib.request
import urllib.parse
from flask import Flask, jsonify, request, send_from_directory, abort
from flask_cors import CORS

from calculations import (
    calculate_position_vector,
    calculate_distance,
    calculate_velocity,
    calculate_speed,
    calculate_acceleration,
    calculate_direction,
    calculate_gradient,
    calculate_divergence,
    calculate_curl,
    calculate_line_integral,
    calculate_gps_error,
    simulate_gps_error,
    correct_gps_position,
    calculate_route_cost,
    generate_demo_route_stats,
    haversine_distance,
)
from database import (
    init_db,
    save_gps_data,
    save_motion_data,
    save_nav_record,
    save_route,
    get_nav_history,
    get_routes,
    get_gps_history,
    get_motion_history,
    get_analytics,
    delete_nav_record,
    clear_nav_history,
)

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
_HERE     = os.path.dirname(os.path.abspath(__file__))
FRONTEND  = os.path.join(_HERE, "..", "frontend")

app = Flask(__name__, static_folder=FRONTEND, static_url_path="")
CORS(app)   # Allow all origins for local development

# Initialise DB on import
init_db()


# ---------------------------------------------------------------------------
# Static file serving (serve frontend from Flask)
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return send_from_directory(FRONTEND, "index.html")


@app.route("/<path:filename>")
def serve_static(filename):
    """Serve any frontend file."""
    full = os.path.join(FRONTEND, filename)
    if os.path.isfile(full):
        return send_from_directory(FRONTEND, filename)
    abort(404)


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------

def _require_json(*fields):
    """Return parsed JSON body and validate required fields."""
    data = request.get_json(silent=True)
    if data is None:
        abort(400, "Request body must be JSON")
    for f in fields:
        if f not in data:
            abort(400, f"Missing field: {f}")
    return data


def _ok(payload: dict):
    return jsonify({"status": "ok", **payload})


def _err(msg: str, code: int = 400):
    return jsonify({"status": "error", "message": msg}), code


# ---------------------------------------------------------------------------
# API — Status
# ---------------------------------------------------------------------------

@app.route("/api/status")
def api_status():
    return _ok({"message": "VectorNav backend is running", "version": "1.0"})


# ---------------------------------------------------------------------------
# API — GPS Position  POST /api/position
# ---------------------------------------------------------------------------

@app.route("/api/position", methods=["POST"])
def api_position():
    """
    Body: { lat, lon, alt (opt), accuracy (opt) }
    Returns position vector + distance if destination provided.
    """
    data = _require_json("lat", "lon")

    lat      = float(data["lat"])
    lon      = float(data["lon"])
    alt      = float(data.get("alt", 0.0))
    accuracy = float(data.get("accuracy", 0.0))

    if not (-90 <= lat <= 90):
        return _err("Latitude must be between -90 and 90")
    if not (-180 <= lon <= 180):
        return _err("Longitude must be between -180 and 180")

    pos_vec = calculate_position_vector(lat, lon, alt)
    save_gps_data(lat, lon, alt, accuracy)

    result = {"position": pos_vec, "accuracy": accuracy}

    # Optional destination distance
    if "dest_lat" in data and "dest_lon" in data:
        d_lat = float(data["dest_lat"])
        d_lon = float(data["dest_lon"])
        d_alt = float(data.get("dest_alt", 0.0))
        dist  = calculate_distance(lat, lon, alt, d_lat, d_lon, d_alt)
        result["distance"] = dist

    return _ok(result)


# ---------------------------------------------------------------------------
# API — Velocity  POST /api/velocity
# ---------------------------------------------------------------------------

@app.route("/api/velocity", methods=["POST"])
def api_velocity():
    """
    Body: { lat1, lon1, alt1, t1, lat2, lon2, alt2, t2 }
    Returns velocity, speed, direction.
    """
    data = _require_json("lat1", "lon1", "t1", "lat2", "lon2", "t2")

    lat1 = float(data["lat1"]); lon1 = float(data["lon1"])
    lat2 = float(data["lat2"]); lon2 = float(data["lon2"])
    alt1 = float(data.get("alt1", 0.0))
    alt2 = float(data.get("alt2", 0.0))
    t1   = float(data["t1"]);   t2   = float(data["t2"])

    vel   = calculate_velocity(lat1, lon1, alt1, t1, lat2, lon2, alt2, t2)
    if "error" in vel:
        return _err(vel["error"])

    spd   = calculate_speed(vel["vx"], vel["vy"], vel["vz"])
    dirn  = calculate_direction(lat1, lon1, lat2, lon2)

    return _ok({"velocity": vel, "speed": spd, "direction": dirn})


# ---------------------------------------------------------------------------
# API — Acceleration  POST /api/acceleration
# ---------------------------------------------------------------------------

@app.route("/api/acceleration", methods=["POST"])
def api_acceleration():
    """
    Body: { vx1, vy1, vz1, t1, vx2, vy2, vz2, t2 }
    """
    data = _require_json("vx1", "vy1", "vz1", "t1", "vx2", "vy2", "vz2", "t2")

    acc = calculate_acceleration(
        float(data["vx1"]), float(data["vy1"]), float(data["vz1"]), float(data["t1"]),
        float(data["vx2"]), float(data["vy2"]), float(data["vz2"]), float(data["t2"])
    )
    if "error" in acc:
        return _err(acc["error"])

    return _ok({"acceleration": acc})


# ---------------------------------------------------------------------------
# API — Route Optimisation  POST /api/route
# ---------------------------------------------------------------------------

@app.route("/api/route", methods=["POST"])
def api_route():
    """
    Body: {
        start_lat, start_lon,
        dest_lat,  dest_lon,
        w1 (opt), w2 (opt), w3 (opt)   — cost weights
    }
    Returns three route options + recommended (lowest cost).
    """
    data = _require_json("start_lat", "start_lon", "dest_lat", "dest_lon")

    s_lat = float(data["start_lat"]); s_lon = float(data["start_lon"])
    d_lat = float(data["dest_lat"]);  d_lon = float(data["dest_lon"])
    w1    = float(data.get("w1", 0.5))
    w2    = float(data.get("w2", 0.3))
    w3    = float(data.get("w3", 0.2))

    # Direct distance
    base_dist_m = haversine_distance(s_lat, s_lon, d_lat, d_lon)
    base_dist_km = base_dist_m / 1000.0

    # Three synthetic routes with realistic variation
    routes = {
        "A": generate_demo_route_stats("Route A", base_dist_km * 1.10, 38, 9.5),
        "B": generate_demo_route_stats("Route B", base_dist_km * 1.00, 45, 6.8),
        "C": generate_demo_route_stats("Route C", base_dist_km * 1.18, 32, 11.2),
    }

    # Recalculate cost with user-provided weights
    for key, r in routes.items():
        r["cost"] = calculate_route_cost(r["distance_km"], r["time_min"], r["error_m"], w1, w2, w3)

    # Find optimal (lowest total cost)
    best_key = min(routes, key=lambda k: routes[k]["cost"]["total_cost"])
    routes[best_key]["optimal"] = True

    # Persist
    save_route(s_lat, s_lon, d_lat, d_lon,
               routes[best_key]["distance_km"],
               routes[best_key]["time_min"],
               routes[best_key]["cost"]["total_cost"],
               best_key)

    return _ok({
        "routes":       routes,
        "optimal_route": best_key,
        "weights":      {"w1": w1, "w2": w2, "w3": w3},
    })


# ---------------------------------------------------------------------------
# API — GPS Error  POST /api/error
# ---------------------------------------------------------------------------

@app.route("/api/error", methods=["POST"])
def api_error():
    """
    Body: { lat, lon, alt (opt), error_m, correction_factor (opt) }
    Returns simulated error + correction result.
    """
    data = _require_json("lat", "lon", "error_m")

    lat      = float(data["lat"])
    lon      = float(data["lon"])
    alt      = float(data.get("alt", 0.0))
    error_m  = float(data["error_m"])
    cf       = float(data.get("correction_factor", 0.85))

    if error_m < 0 or error_m > 10_000:
        return _err("error_m must be between 0 and 10000")

    sim      = simulate_gps_error(lat, lon, alt, error_m)
    meas_lat = sim["measured"]["lat"]
    meas_lon = sim["measured"]["lon"]

    correction = correct_gps_position(lat, lon, meas_lat, meas_lon, cf)

    # Vector calculus demonstrations on the route field
    # Build a simple 3×3 elevation-like field for gradient/divergence/curl demo
    f = [
        [alt - 5, alt - 3, alt - 1],
        [alt - 4, alt,     alt + 2],
        [alt - 2, alt + 1, alt + 3],
    ]
    grad = calculate_gradient(f)
    div  = calculate_divergence(
        [[1, 1, 1], [1, 1, 1], [1, 1, 1]],    # Fx (constant flow east)
        [[0, 0, 0], [0, 0, 0], [0, 0, 0]]      # Fy (no north flow)
    )
    curl_res = calculate_curl(
        [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
        [[1, 1, 1], [1, 1, 1], [1, 1, 1]]
    )

    return _ok({
        "simulation": sim,
        "correction": correction,
        "vector_calculus_demo": {
            "gradient":   grad,
            "divergence": div,
            "curl":       curl_res,
        },
    })


# ---------------------------------------------------------------------------
# API — Vector Calculus demos  POST /api/vector
# ---------------------------------------------------------------------------

@app.route("/api/vector", methods=["POST"])
def api_vector():
    """
    General vector calculus demonstration.
    Body: { operation: gradient|divergence|curl|line_integral, ... }
    """
    data = request.get_json(silent=True) or {}
    op   = data.get("operation", "gradient")

    if op == "gradient":
        f = data.get("f_values", [
            [1, 2, 3], [4, 5, 6], [7, 8, 9]
        ])
        return _ok({"gradient": calculate_gradient(f)})

    elif op == "divergence":
        Fx = data.get("Fx", [[1,1,1],[1,1,1],[1,1,1]])
        Fy = data.get("Fy", [[0,0,0],[0,0,0],[0,0,0]])
        return _ok({"divergence": calculate_divergence(Fx, Fy)})

    elif op == "curl":
        Fx = data.get("Fx", [[0,0,0],[0,0,0],[0,0,0]])
        Fy = data.get("Fy", [[1,1,1],[1,1,1],[1,1,1]])
        return _ok({"curl": calculate_curl(Fx, Fy)})

    elif op == "line_integral":
        F  = data.get("F",  [(1, 0), (1, 1), (0, 1)])
        dr = data.get("dr", [(1, 0), (1, 0), (0, 1)])
        return _ok({"line_integral": calculate_line_integral(F, dr)})

    return _err(f"Unknown operation: {op}")


# ---------------------------------------------------------------------------
# API — Navigation History  GET / POST / DELETE
# ---------------------------------------------------------------------------

@app.route("/api/history", methods=["GET"])
def api_history_get():
    limit = int(request.args.get("limit", 200))
    return _ok({"history": get_nav_history(limit)})


@app.route("/api/history", methods=["POST"])
def api_history_post():
    data = _require_json("lat", "lon")

    rid = save_nav_record(
        float(data["lat"]),
        float(data["lon"]),
        float(data.get("speed", 0.0)),
        float(data.get("acceleration", 0.0)),
        float(data.get("direction", 0.0)),
        float(data.get("accuracy", 0.0)),
        float(data.get("altitude", 0.0)),
        str(data.get("session_id", "")),
    )
    return _ok({"id": rid})


@app.route("/api/history/<int:record_id>", methods=["DELETE"])
def api_history_delete(record_id):
    delete_nav_record(record_id)
    return _ok({"deleted_id": record_id})


@app.route("/api/history/clear", methods=["DELETE"])
def api_history_clear():
    clear_nav_history()
    return _ok({"message": "Navigation history cleared"})


# ---------------------------------------------------------------------------
# API — Analytics  GET /api/analytics
# ---------------------------------------------------------------------------

@app.route("/api/analytics")
def api_analytics():
    stats = get_analytics()
    nav_hist = get_nav_history(500)

    # Build time-series for charts (chronological, limited to 100)
    recent = list(reversed(nav_hist[-100:]))
    chart_labels  = [r["timestamp"][-8:] for r in recent]  # HH:MM:SS
    chart_speed   = [round(r["speed"] * 3.6, 2) for r in recent]   # km/h
    chart_acc     = [round(r["acceleration"], 4) for r in recent]
    chart_acc_raw = [round(r["accuracy"], 2) for r in recent]

    return _ok({
        "summary":      stats,
        "charts": {
            "labels":       chart_labels,
            "speed_kmh":    chart_speed,
            "acceleration": chart_acc,
            "accuracy":     chart_acc_raw,
        },
    })


# ---------------------------------------------------------------------------
# API — Raw GPS / Motion history (for module pages)
# ---------------------------------------------------------------------------

@app.route("/api/gps")
def api_gps_get():
    return _ok({"gps_data": get_gps_history(100)})


@app.route("/api/motion")
def api_motion_get():
    return _ok({"motion_data": get_motion_history(200)})


# ---------------------------------------------------------------------------
# API — Address Geocoding & Reverse-Geocoding (Address search & Map pick)
# ---------------------------------------------------------------------------

@app.route("/api/geocode")
def api_geocode():
    """Forward geocode: query string -> list of address matches."""
    query = request.args.get("q", "").strip()
    if not query:
        return _err("Query parameter 'q' is required")
    try:
        url = f"https://nominatim.openstreetmap.org/search?format=json&q={urllib.parse.quote(query)}&countrycodes=in&limit=8"
        req = urllib.request.Request(url, headers={"User-Agent": "VectorNav/1.0 (BTech Capstone Project)"})
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode())
            results = [{
                "display_name": item.get("display_name"),
                "lat": float(item.get("lat")),
                "lon": float(item.get("lon")),
                "type": item.get("type"),
            } for item in data]
            return _ok({"results": results})
    except Exception as e:
        return _ok({"results": [], "error": str(e)})


@app.route("/api/reverse-geocode")
def api_reverse_geocode():
    """Reverse geocode: lat, lon -> human readable address name."""
    lat = request.args.get("lat")
    lon = request.args.get("lon")
    if not lat or not lon:
        return _err("lat and lon parameters are required")
    try:
        url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lon}"
        req = urllib.request.Request(url, headers={"User-Agent": "VectorNav/1.0 (BTech Capstone Project)"})
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode())
            name = data.get("display_name")
            return _ok({
                "display_name": name or f"Coordinates: {lat}, {lon}",
                "address": data.get("address", {}),
                "lat": float(lat),
                "lon": float(lon),
            })
    except Exception as e:
        return _ok({
            "display_name": f"Location [{float(lat):.5f}, {float(lon):.5f}]",
            "lat": float(lat),
            "lon": float(lon),
            "fallback": True
        })


@app.route("/api/route-waypoints", methods=["POST"])
def api_route_waypoints():
    """
    Given start_lat, start_lon, dest_lat, dest_lon:
    Calculates exact real-time waypoints between the user's location and destination.
    Uses OSRM driving engine when online, or vector calculus geodesic interpolation.
    """
    data = _require_json("start_lat", "start_lon", "dest_lat", "dest_lon")
    s_lat = float(data["start_lat"])
    s_lon = float(data["start_lon"])
    d_lat = float(data["dest_lat"])
    d_lon = float(data["dest_lon"])

    # Fallback mathematical route generator
    def _math_fallback(reason=""):
        total_dist_m = haversine_distance(s_lat, s_lon, d_lat, d_lon)
        total_dist_km = round(total_dist_m / 1000.0, 2)
        # Determine number of intermediate waypoints based on distance (min 5, max 15)
        n_steps = max(5, min(15, int(total_dist_km / 1.5) + 3))

        waypoints = []
        polyline = []
        cum_dist = 0.0
        prev_pos = calculate_position_vector(s_lat, s_lon, 10.0)

        for i in range(n_steps + 1):
            t = i / float(n_steps)
            pt_lat = s_lat + t * (d_lat - s_lat)
            pt_lon = s_lon + t * (d_lon - s_lon)
            curr_pos = calculate_position_vector(pt_lat, pt_lon, 10.0)

            dx = round(curr_pos["x"] - prev_pos["x"], 2)
            dy = round(curr_pos["y"] - prev_pos["y"], 2)
            dz = round(curr_pos["z"] - prev_pos["z"], 2)
            seg_dist_km = round(math.sqrt(dx**2 + dy**2 + dz**2) / 1000.0, 3) if i > 0 else 0.0
            cum_dist = round(cum_dist + seg_dist_km, 3)

            name = "Start (My Location)" if i == 0 else "Destination" if i == n_steps else f"Waypoint {i}"
            waypoints.append({
                "index": i,
                "label": f"W{i}" if 0 < i < n_steps else ("Start" if i == 0 else "End"),
                "name": name,
                "lat": round(pt_lat, 6),
                "lon": round(pt_lon, 6),
                "alt": 10.0,
                "delta_r": {"dx": dx, "dy": dy, "dz": dz},
                "seg_dist_km": seg_dist_km,
                "cum_dist_km": cum_dist,
            })
            polyline.append([round(pt_lat, 6), round(pt_lon, 6)])
            prev_pos = curr_pos

        return _ok({
            "source": "vector_calculus_interpolation",
            "total_waypoints": len(waypoints),
            "distance_km": total_dist_km,
            "duration_min": round((total_dist_km / 40.0) * 60.0, 1),
            "waypoints": waypoints,
            "polyline": polyline,
            "note": reason,
        })

    # Try OSRM real road routing
    try:
        url = f"https://router.project-osrm.org/route/v1/driving/{s_lon},{s_lat};{d_lon},{d_lat}?overview=full&geometries=geojson&steps=true"
        req = urllib.request.Request(url, headers={"User-Agent": "VectorNav/1.0 (BTech Capstone Project)"})
        with urllib.request.urlopen(req, timeout=5) as response:
            res_data = json.loads(response.read().decode())
            if not res_data.get("routes"):
                return _math_fallback("OSRM returned no routes")

            route = res_data["routes"][0]
            raw_coords = route["geometry"]["coordinates"] # [ [lon, lat], ... ]
            polyline = [[c[1], c[0]] for c in raw_coords]
            total_dist_km = round(route["distance"] / 1000.0, 2)
            duration_min = round(route["duration"] / 60.0, 1)

            # Sample key waypoints along the route polyline (between 6 and 16 waypoints)
            num_samples = max(6, min(16, len(polyline)))
            step_stride = max(1, (len(polyline) - 1) // (num_samples - 1))

            sampled_indices = [0]
            curr_idx = step_stride
            while curr_idx < len(polyline) - 1:
                sampled_indices.append(curr_idx)
                curr_idx += step_stride
            if (len(polyline) - 1) not in sampled_indices:
                sampled_indices.append(len(polyline) - 1)

            waypoints = []
            cum_dist = 0.0
            prev_pos = calculate_position_vector(polyline[0][0], polyline[0][1], 10.0)

            # Extract maneuver names from steps if available
            steps = route.get("legs", [{}])[0].get("steps", [])

            for rank, idx in enumerate(sampled_indices):
                pt_lat, pt_lon = polyline[idx]
                curr_pos = calculate_position_vector(pt_lat, pt_lon, 10.0)
                dx = round(curr_pos["x"] - prev_pos["x"], 2)
                dy = round(curr_pos["y"] - prev_pos["y"], 2)
                dz = round(curr_pos["z"] - prev_pos["z"], 2)
                seg_dist_km = round(math.sqrt(dx**2 + dy**2 + dz**2) / 1000.0, 3) if rank > 0 else 0.0
                cum_dist = round(cum_dist + seg_dist_km, 3)

                # Name heuristic
                if rank == 0:
                    name = "Start: My Location"
                elif rank == len(sampled_indices) - 1:
                    name = "Destination"
                else:
                    step_name = ""
                    step_idx = int((idx / len(polyline)) * len(steps))
                    if 0 <= step_idx < len(steps):
                        step_name = steps[step_idx].get("name", "")
                    name = f"Waypoint {rank}" + (f" ({step_name})" if step_name else "")

                waypoints.append({
                    "index": rank,
                    "label": f"W{rank}" if 0 < rank < len(sampled_indices) - 1 else ("Start" if rank == 0 else "End"),
                    "name": name,
                    "lat": round(pt_lat, 6),
                    "lon": round(pt_lon, 6),
                    "alt": 10.0,
                    "delta_r": {"dx": dx, "dy": dy, "dz": dz},
                    "seg_dist_km": seg_dist_km,
                    "cum_dist_km": cum_dist,
                })
                prev_pos = curr_pos

            return _ok({
                "source": "osrm_road_routing",
                "total_waypoints": len(waypoints),
                "distance_km": total_dist_km,
                "duration_min": duration_min,
                "waypoints": waypoints,
                "polyline": polyline,
            })
    except Exception as e:
        return _math_fallback(f"OSRM service unreachable ({str(e)}), used vector interpolation")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=" * 60)
    print("  VectorNav — Application of Vector Calculus in GPS Nav")
    print("  Server starting on http://localhost:5000")
    print("  Open http://localhost:5000 in your browser.")
    print("=" * 60)
    app.run(debug=True, host="0.0.0.0", port=5000)
