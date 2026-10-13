"""Export one validated assembly episode for static browser playback.

Run with --recording PATH_TO_COMPLETED_EPISODE --cad PATH_TO_ASSEMBLY_GLB.
Only playback fields are exported; training files and machine paths are omitted.
"""
import argparse
import gzip
import hashlib
import json
import math
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'assembly'

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--recording', type=Path, required=True)
    parser.add_argument('--cad', type=Path, required=True)
    args = parser.parse_args()
    validation = json.loads((args.recording / 'validation.json').read_text())
    assert validation['status'] == 'success' and validation['installed_count'] == 11
    assert validation['full_assembly'] and validation['cover']['free_cover_entire_episode']
    source = json.loads((args.recording / 'motion.json').read_text())
    assert source['result']['full_assembly_complete']
    order = source['result']['requested_order']
    assert sorted(order) == list(range(11))
    fields = ['time', 'phase', 'active_screw', 'completed_screws', 'retained_screws',
              'magnet_active', 'grip_N', 'palm_N', 'insert_N', 'cover_N']
    # Preserve every recorded frame. Quantize positions to one micrometre and
    # quaternions to 1e-5, then store integer differences between frames.
    scales = [1_000_000]*3 + [100_000]*4
    previous = [0]*(7*len(source['body_labels']))
    frames = []
    max_position_error = 0.
    for frame in source['frames']:
        flat = [int(round(value*scales[j])) for pose in frame['poses'] for j, value in enumerate(pose)]
        max_position_error = max(max_position_error, max(abs(flat[i*7+j]/scales[j]-pose[j])
            for i, pose in enumerate(frame['poses']) for j in range(3)))
        record = {key: frame.get(key, 0) for key in fields}
        for key in ['grip_N', 'palm_N', 'insert_N', 'cover_N']:
            record[key] = round(record[key], 4)
        record['poses_delta'] = [value-old for value, old in zip(flat, previous)]
        previous = flat
        frames.append(record)
    assert max_position_error <= .00000050001
    labels = []
    for label in source['body_labels']:
        if '/Robot/' in label: labels.append('/Robot/' + label.split('/')[-1])
        elif '/Screw' in label: labels.append('/' + '/'.join(label.split('/')[-2:]))
        else: labels.append('/' + label.split('/')[-1])
    result = dict(scene=source['result']['scene'], requested_order=order)
    payload = dict(format='assembly-pose-delta-v1', pose_scales=scales, body_labels=labels,
        settings=dict(screw_head_top=source['settings']['screw_head_top']), result=result, frames=frames)
    raw = json.dumps(payload, separators=(',', ':'), allow_nan=False).encode()
    assert b'/sdf/' not in raw and b'/home/' not in raw
    data = ROOT / 'data'; data.mkdir(parents=True, exist_ok=True)
    packed = gzip.compress(raw, compresslevel=9, mtime=0)
    (data / 'assembly.json.gz').write_bytes(packed)
    assets = ROOT / 'assets'; assets.mkdir(exist_ok=True)
    shutil.copyfile(args.cad, assets / 'assembly.glb')
    metadata = dict(format=payload['format'], frames=len(frames), installed_screws=11,
        duration_seconds=frames[-1]['time'], file='data/assembly.json.gz',
        sha256=hashlib.sha256(packed).hexdigest(), bytes=len(packed),
        maximum_position_quantization_error_m=max_position_error,
        simulation='Isaac Lab 3.0 / Newton / MuJoCo-Warp', controller='Scripted full-state / IK',
        model='Rigid bodies, magnetic screw pickup and ideal seated retention; no detailed threads or preload')
    (data / 'recording.json').write_text(json.dumps(metadata, indent=2)+'\n')
    print(json.dumps(metadata, indent=2))

if __name__ == '__main__':
    main()
