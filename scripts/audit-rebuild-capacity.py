"""Offline evidence aggregation. No network, credentials, or application writes."""
import hashlib
import json
import math
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/rebuild-20261028'
MODEL = 'openai/gpt-oss-120b'

def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest()

def summary(rows):
    known = [r for r in rows if r['usageKnown']]
    return {'jobs': len(rows), 'knownUsageJobs': len(known),
            'calls': sum(r['calls'] for r in rows),
            'inputTokens': sum(r['inputTokens'] for r in known),
            'outputTokens': sum(r['outputTokens'] for r in known),
            'meanJobTokens': statistics.mean(r['totalTokens'] for r in known) if known else None,
            'maxJobTokens': max((r['totalTokens'] for r in known), default=None),
            'meanCalls': statistics.mean(r['calls'] for r in rows) if rows else None,
            'maxCalls': max((r['calls'] for r in rows), default=None)}

snapshots = []
def walk(obj, origin, model=None, owner=None, status="unknown"):
    if isinstance(obj, list):
        for n, row in enumerate(obj): walk(row, f'{origin}[{n}]', model, owner, status)
    elif isinstance(obj, dict):
        model = obj.get('model', model)
        status = (obj.get('quality') or {}).get('status', status)
        if isinstance(obj.get('stage'), str): status = obj['stage'] if status == 'unknown' else status
        owner = obj.get('item_code', obj.get('itemCode', obj.get('evaluationRun', owner)))
        if isinstance(obj.get('calls'), list) and obj['calls'] and all(isinstance(c, dict) and 'stage' in c for c in obj['calls']):
            snapshots.append({'origin': origin, 'model': model, 'owner': owner,
                              'status': status,
                              'callsRaw': obj['calls']})
        for k, v in obj.items():
            if k != 'calls': walk(v, origin + '/' + k, model, owner, status)

# Frozen historical records and all checked-in docs JSON, including early model experiments.
# Derived replay files are excluded; the frozen inputs retain the historical originals.
paths = [p for p in ROOT.joinpath('docs').rglob('*.json')
         if 'rebuild-20261028' not in p.parts and
         ('evaluations' not in p.parts or p.name == 'inputs.json')]
for p in sorted(paths):
    walk(json.loads(p.read_text()), str(p.relative_to(ROOT)))

# Exact call traces are repeated in database snapshots and diagnostic archives.
# A longer trace supersedes a byte-identical prefix, never adds it a second time.
unique = {}
for s in snapshots:
    fingerprints = tuple(digest(c) for c in s['callsRaw'])
    key = (s['model'], fingerprints)
    if key in unique: unique[key]['origins'].append(s['origin'])
    else: unique[key] = {**s, 'fingerprints': fingerprints, 'origins': [s['origin']]}
maximal = [s for (m, f), s in unique.items()
           if not any(m == m2 and len(f2) > len(f) and f2[:len(f)] == f for m2, f2 in unique)]
rows = []
for s in maximal:
    calls = s['callsRaw']
    known = all(isinstance(c.get('usage'), dict) and
                all(isinstance(c['usage'].get(k), int) and c['usage'][k] >= 0
                    for k in ('prompt_tokens', 'completion_tokens')) for c in calls)
    i = sum((c.get('usage') or {}).get('prompt_tokens', 0) for c in calls)
    o = sum((c.get('usage') or {}).get('completion_tokens', 0) for c in calls)
    rows.append({'model': s['model'], 'itemCode': s['owner'], 'origins': s['origins'],
                 'traceHash': digest(calls), 'callHashes': list(s['fingerprints']),
                 'status': s['status'], 'calls': len(calls), 'usageKnown': known,
                 'inputTokens': i if known else None, 'outputTokens': o if known else None,
                 'totalTokens': i+o if known else None,
                 'elapsedMs': sum(c.get('elapsedMs', 0) for c in calls),
                 'callDetails': calls})
target = [r for r in rows if r['model'] == MODEL]
assert target, 'No attributable model traces'
status = {s: summary([r for r in target if r['status'] == s]) for s in sorted({r['status'] for r in target})}
total = summary(target)
assert len({h for r in target for h in r['callHashes']}) == total['calls'], 'Overlapping traces need manual resolution'
review_records = {}
for p in sorted(ROOT.joinpath('docs/measurements').glob('fixed-review*.json')):
    for r in json.loads(p.read_text()).get('records', []):
        if (r.get('result') or {}).get('usage'):
            review_records[digest([r.get('item_code'), r['result']])] = r['result']['usage']
review_summary = {'calls': len(review_records), 'inputTokens': sum(u['prompt_tokens'] for u in review_records.values()), 'outputTokens': sum(u['completion_tokens'] for u in review_records.values()), 'model': 'not recorded in these rows; not added to model-attributed job totals'}
mean = total['meanJobTokens']
result = {'baseline': 'f6f6c95b2e5322e872b2db8ab02b7c5bb4c3ddad',
          'scope': 'checked-in docs JSON execution traces; exact/prefix snapshots deduplicated; not account billing ledger',
          'limitations': ['No provider request IDs: indistinguishable traces cannot establish a complete account ledger.',
                         'Calls absent from saved traces, 429 and usage-unknown transport failures may be missing.',
                         'ready is the historical engine label, not independent quality approval.',
                         'Different versions, repeated products and selected failures are diagnostic, not population estimates.',
                         'Review-only measurements are reported separately and cannot count as completed products.'],
          'filesScanned': len(paths), 'snapshots': len(snapshots), 'maximalTraces': len(rows),
          'targetModel': MODEL, 'summary': total, 'byStatus': status, 'reviewOnlyMeasurements': review_summary,
          'unattributedTraces': sum(r['model'] is None for r in rows),
          'otherModelTraces': sum(r['model'] is not None and r['model'] != MODEL for r in rows),
          'capacity': {'publicLimits': {'RPM': 30, 'RPD': 1000, 'TPM': 8000, 'TPD': 200000},
                       'currentAccountLimitsVerified': False,
                       'targetDailyFreshCompletions': 90, 'maximumTokensPerCompletionIncludingFailures': 200000/90,
                       'diagnosticAttemptsPerDayAtObservedMean': min(math.floor(200000/mean), math.floor(1000/total['meanCalls'])),
                       'diagnosticTokenMinutesFor30AttemptsAtMean': 30*mean/8000,
                       'qualityVerifiedCompletionsPerDay': None},
          'jobs': rows}
OUT.mkdir(exist_ok=True)
(OUT/'capacity-evidence.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
print(json.dumps({k: result[k] for k in ('summary', 'byStatus', 'unattributedTraces', 'otherModelTraces', 'capacity')}, ensure_ascii=False, indent=2))
