"""Verify static exports against both original recordings, frame by frame."""
import argparse
import gzip
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'assembly'


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--cover-recording', type=Path, required=True)
    p.add_argument('--screw-recording', type=Path, required=True)
    args = p.parse_args()
    manifest = json.loads((ROOT / 'data/recording.json').read_text())
    assert not manifest['continuous_simulation'] and manifest['transition_seconds'] == 3
    results = []
    for meta, folder, source_name in zip(manifest['chapters'],
            [args.cover_recording, args.screw_recording], ['cover-motion.json', 'replay.json']):
        packed = (ROOT / meta['file']).read_bytes()
        assert hashlib.sha256(packed).hexdigest() == meta['sha256']
        exported = json.loads(gzip.decompress(packed))
        source = json.loads((folder / source_name).read_text())
        if meta['id'] == 'cover':
            end = json.loads((folder / 'cover-result.json').read_text())['placement_time']
            source['frames'] = [f for f in source['frames'] if f['time'] <= end]
        assert len(source['frames']) == len(exported['frames']) == meta['frames']
        assert exported['body_labels'] == [s[6:] if s.startswith('/World') else s for s in source['body_labels']]
        previous = [0] * (len(source['body_labels']) * 7)
        max_pos, max_angle = 0., 0.
        for original, frame in zip(source['frames'], exported['frames']):
            assert original['time'] == frame['time'] and original['phase'] == frame['phase']
            for key, value in frame.items():
                if key != 'poses_delta':
                    assert value == original[key], key
            previous = [a + b for a, b in zip(previous, frame['poses_delta'])]
            for i, pose in enumerate(original['poses']):
                decoded = [previous[i*7+j] / exported['pose_scales'][j] for j in range(7)]
                max_pos = max(max_pos, max(abs(a-b) for a,b in zip(decoded[:3],pose[:3])))
                dot = abs(sum(a*b for a,b in zip(decoded[3:],pose[3:])))
                norm = math.sqrt(sum(a*a for a in decoded[3:])*sum(a*a for a in pose[3:]))
                max_angle = max(max_angle, 2*math.acos(min(1.,dot/norm))*180/math.pi)
        assert max_pos <= .00000050001 and max_angle < .002
        results.append(dict(chapter=meta['id'],frames=meta['frames'],max_position_error_m=max_pos,max_rotation_error_deg=max_angle))
        del source, exported
    assert manifest['chapters'][1]['offset_seconds'] == manifest['chapters'][0]['duration_seconds']+3
    assert manifest['validation']['screws_placed']==manifest['validation']['screws_driven']==11
    print(json.dumps(dict(passed=True,roundtrip=results,explicit_scene_cut=True),indent=2))


if __name__ == '__main__':
    main()
