"""Package a baseline recording collection plus selected replacement recordings.

Inputs contain selection.json, data/<id>/trajectory.json, movies and posters.
Only portable trajectory data and playable media enter the public site.
"""
import argparse
import gzip
import io
import json
from pathlib import Path
import shutil


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', required=True, type=Path)
    parser.add_argument('--updates', type=Path)
    args = parser.parse_args()
    docs = Path(__file__).resolve().parents[1]
    chosen = {}
    for root in [args.baseline, args.updates]:
        if root is None:
            continue
        for case in json.loads((root / 'selection.json').read_text())['cases']:
            previous = chosen.get(case['id'])
            if previous is None or case['original_successes'] > previous[0]['original_successes']:
                chosen[case['id']] = (case, root)
    cases = []
    for identifier, (case, root) in sorted(chosen.items()):
        raw = json.loads((root / 'data' / identifier / 'trajectory.json').read_text())
        assert raw['episode']['full_trajectory'], identifier
        assert raw['checkpoint_sha256'] == case['checkpoint_sha256'], identifier
        assert raw['frames'][-1]['successes'] == case['total_waypoints'], identifier
        raw.pop('robot_urdf', None)
        compact = json.dumps(raw, separators=(',', ':'), allow_nan=False).encode()
        assert b'/sdf/' not in compact and b'/home/' not in compact
        entry = {key: case[key] for key in (
            'id', 'category', 'object', 'task', 'seed', 'trial', 'total_waypoints',
            'original_successes', 'transitions', 'checkpoint_sha256')}
        entry['duration'] = raw['episode']['simulated_seconds']
        for key, source, destination in [
            ('mp4', 'movies/' + identifier + '.mp4', 'media/videos/' + identifier + '.mp4'),
            ('vp8', 'movies/' + identifier + '.vp8.webm', 'media/videos/' + identifier + '.vp8.webm'),
            ('poster', 'posters/' + identifier + '-middle.png', 'media/posters/' + identifier + '.png'),
        ]:
            (docs / destination).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(root / source, docs / destination)
            entry[key] = destination
        entry['trajectory'] = 'data/trajectories/' + identifier + '.json.gz'
        compressed = io.BytesIO()
        with gzip.GzipFile(fileobj=compressed, mode='wb', filename='', mtime=0) as stream:
            stream.write(compact)
        (docs / entry['trajectory']).write_bytes(compressed.getvalue())
        cases.append(entry)
    cases.sort(key=lambda case: case['id'] != 'hammer__mallet_hammer__swing_down')
    assert len(cases) == 24
    manifest = dict(
        policy_id=0, simulation='Isaac Gym / PhysX', seed=90011, trials_per_task=10,
        selection='Higher task completion count across 166B and 172B; keep 166B on ties. '
                  'Lowest-index successful trial in the selected original batch. Curated successes.',
        success_rule=dict(nominal_tolerance_m=.01, keypoint_scale=1.5,
                          raw_keypoint_gap_m=.015, hold_steps=1), cases=cases)
    (docs / 'data/gallery.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print('Packaged', len(cases), 'successful trajectories')


if __name__ == '__main__':
    main()
