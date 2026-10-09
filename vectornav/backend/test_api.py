"""Quick API verification script."""
import sys, json, urllib.request
sys.stdout.reconfigure(encoding='utf-8')

BASE = 'http://localhost:5000/api'

def post(endpoint, body):
    req = urllib.request.Request(
        BASE + endpoint,
        data=json.dumps(body).encode(),
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    return json.loads(urllib.request.urlopen(req).read())

def get(endpoint):
    return json.loads(urllib.request.urlopen(BASE + endpoint).read())

def delete(endpoint):
    req = urllib.request.Request(BASE + endpoint, method='DELETE')
    return json.loads(urllib.request.urlopen(req).read())

errors = []

def check(name, condition, detail=''):
    status = 'PASS' if condition else 'FAIL'
    print(f'  [{status}] {name}' + (f' — {detail}' if detail else ''))
    if not condition:
        errors.append(name)

print('=' * 55)
print('  VectorNav API Test Suite')
print('=' * 55)

# 1. Status
print('\n1. Server Status')
d = get('/status')
check('status ok', d['status'] == 'ok', d.get('message'))

# 2. Position
print('\n2. Position Calculation')
d = post('/position', {'lat': 17.4949, 'lon': 78.3996, 'alt': 542, 'accuracy': 4.2,
                        'dest_lat': 17.4239, 'dest_lon': 78.3418})
check('status ok', d['status'] == 'ok')
check('has position', 'position' in d)
check('ecef x valid', abs(d['position']['x']) > 1e6)
check('has distance', 'distance' in d)
check('distance km > 0', d['distance']['distance_km'] > 0)
print(f'     Distance: {d["distance"]["distance_km"]} km')

# 3. Velocity
print('\n3. Velocity Calculation')
d = post('/velocity', {'lat1': 17.4949, 'lon1': 78.3996, 'alt1': 542, 't1': 0,
                        'lat2': 17.4870, 'lon2': 78.3930, 'alt2': 539, 't2': 3})
check('status ok', d['status'] == 'ok')
check('speed > 0', d['speed']['speed_kmh'] > 0)
check('cardinal valid', len(d['direction']['cardinal']) > 0)
print(f'     Speed: {d["speed"]["speed_kmh"]} km/h, Dir: {d["direction"]["cardinal"]}')

# 4. Acceleration
print('\n4. Acceleration Calculation')
d = post('/acceleration', {'vx1': 5.0, 'vy1': 3.0, 'vz1': 0.1, 't1': 0,
                            'vx2': 5.5, 'vy2': 3.2, 'vz2': 0.1, 't2': 3})
check('status ok', d['status'] == 'ok')
check('ax valid', 'ax' in d['acceleration'])
print(f'     Accel magnitude: {d["acceleration"]["acc_magnitude"]} m/s2')

# 5. Route Optimization
print('\n5. Route Optimization')
d = post('/route', {'start_lat': 17.4949, 'start_lon': 78.3996,
                     'dest_lat': 17.4239, 'dest_lon': 78.3418})
check('status ok', d['status'] == 'ok')
check('has 3 routes', len(d['routes']) == 3)
check('optimal key valid', d['optimal_route'] in ['A', 'B', 'C'])
for k, r in d['routes'].items():
    c = r['cost']['total_cost']
    print(f'     Route {k}: {r["distance_km"]} km, cost={c}')
print(f'     Optimal: Route {d["optimal_route"]}')

# 6. GPS Error Simulation
print('\n6. GPS Error Simulation')
d = post('/error', {'lat': 17.4474, 'lon': 78.3762, 'error_m': 20})
check('status ok', d['status'] == 'ok')
check('error before > 0', d['correction']['error_before_m'] > 0)
check('error after < before', d['correction']['error_after_m'] < d['correction']['error_before_m'])
check('improvement > 0', d['correction']['improvement_pct'] > 0)
print(f'     Before: {d["correction"]["error_before_m"]} m')
print(f'     After : {d["correction"]["error_after_m"]} m')
print(f'     Improv: {d["correction"]["improvement_pct"]} %')

# 7. History Save + Retrieve
print('\n7. Navigation History')
d = post('/history', {'lat': 17.4474, 'lon': 78.3762, 'speed': 5.5,
                       'acceleration': 0.2, 'direction': 225.0, 'accuracy': 4.5})
check('save ok', d['status'] == 'ok')
rec_id = d['id']
d2 = get('/history?limit=5')
check('retrieve ok', d2['status'] == 'ok')
check('has records', len(d2['history']) >= 1)
print(f'     Saved record ID: {rec_id}, total: {len(d2["history"])}')

# 8. Analytics
print('\n8. Analytics')
d = get('/analytics')
check('status ok', d['status'] == 'ok')
check('has summary', 'summary' in d)
check('has charts', 'charts' in d)

# 9. Delete history record
print('\n9. Delete History Record')
d = delete(f'/history/{rec_id}')
check('delete ok', d['status'] == 'ok')

# 10. Vector Calculus demos
print('\n10. Vector Calculus Demos')
for op in ['gradient', 'divergence', 'curl', 'line_integral']:
    d = post('/vector', {'operation': op})
    check(f'{op} ok', d['status'] == 'ok')

print()
print('=' * 55)
if errors:
    print(f'RESULT: {len(errors)} FAILED — {errors}')
else:
    print(f'RESULT: ALL {10} TEST GROUPS PASSED!')
print('=' * 55)
