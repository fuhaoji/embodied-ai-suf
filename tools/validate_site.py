"""Validate public recordings, links, metadata, and absence of private paths."""
import gzip
import json
import math
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
manifest = json.loads((DOCS / 'data/gallery.json').read_text())
assert len(manifest['cases']) == 24
assert len({c['id'] for c in manifest['cases']}) == 24
assert len({c['object'] for c in manifest['cases']}) == 12
checked_frames = 0
for case in manifest['cases']:
    for key in ['mp4', 'vp8', 'poster', 'trajectory']:
        path = DOCS / case[key]
        assert path.is_file() and path.stat().st_size > 0, path
    raw = gzip.decompress((DOCS / case['trajectory']).read_bytes())
    assert b'/sdf/' not in raw and b'/home/' not in raw
    data = json.loads(raw)
    assert data['checkpoint_sha256'] == case['checkpoint_sha256']
    assert data['transitions'] == case['transitions']
    assert data['trial'] == case['trial'] and data['seed'] == case['seed']
    assert data['episode']['full_trajectory']
    assert data['frames'][-1]['successes'] == case['total_waypoints']
    assert data['frames'][-1]['keypoint_distance'] <= .015
    assert abs(data['episode']['simulated_seconds'] - case['duration']) < 1e-7
    for frame in data['frames']:
        assert len(frame['robot']) == len(data['body_names']) == 30
        assert all(math.isfinite(v) for pose in frame['robot'] + [frame['object'], frame['goal']]
                   + frame['object_keypoints'] + frame['goal_keypoints'] for v in pose)
        distance = max(math.sqrt(sum((a-b)**2 for a, b in zip(obj, goal)))
                       for obj, goal in zip(frame['object_keypoints'], frame['goal_keypoints']))
        assert abs(distance - frame['keypoint_distance']) < 1e-6
        checked_frames += 1
    for suffix in ['.glb', '-collision.glb']:
        assert (DOCS / 'replay/assets/tools' / (case['object'] + suffix)).is_file()
for file in DOCS.rglob('*'):
    assert not file.is_symlink(), file
    if not file.is_file():
        continue
    assert file.stat().st_size < 100_000_000, file
    if file.suffix in ['.html', '.js', '.json', '.css', '.txt']:
        text = file.read_text()
        assert '/sdf/' not in text and '/home/j/' not in text, file
    if file.suffix == '.html':
        for target in re.findall(r'(?:href|src)="([^"]+)"', text):
            if target.startswith(('https:', 'http:', 'data:', '#')):
                continue
            relative = target.split('#')[0].split('?')[0]
            assert (file.parent / relative).exists(), (file, target)
print(json.dumps(dict(status='passed', trajectories=24, frames=checked_frames,
                      files=sum(p.is_file() for p in DOCS.rglob('*'))), indent=2))
