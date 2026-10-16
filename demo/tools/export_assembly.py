"""Export validated cover and mechanical screw recordings as explicit chapters.
These are separate simulations, never a fabricated continuous physical episode.
All source samples within each selected stage are preserved. Only poses and
public display fields enter the website; no checkpoints or machine paths.
"""
import argparse
import gzip
import hashlib
import io
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'assembly'
SCALES = [1_000_000] * 3 + [100_000] * 4
FIELDS = ('time', 'phase', 'active_screw', 'placed', 'driven', 'retained_screws',
          'grip_N', 'claw_N', 'button_N', 'button_travel_m', 'jaw_radius_m',
          'tip_exposure_m', 'underhead_count', 'tool', 'driver_angle', 'cover_N')


def read(path):
    return json.loads(path.read_text())


def export(source, name, layout, backend, model):
    previous = [0] * (7 * len(source['body_labels']))
    frames, max_error = [], 0.
    last_time = -1
    for frame in source['frames']:
        assert frame['time'] > last_time
        last_time = frame['time']
        flat = [int(round(v * SCALES[j])) for p in frame['poses'] for j, v in enumerate(p)]
        assert len(flat) == len(previous)
        for p in frame['poses']:
            assert all(math.isfinite(v) for v in p)
            assert abs(sum(v * v for v in p[3:]) - 1) < .001
        max_error = max(max_error, max(abs(flat[7*i+j] / SCALES[j] - p[j])
                        for i, p in enumerate(frame['poses']) for j in range(3)))
        row = {k: frame[k] for k in FIELDS if k in frame}
        row['poses_delta'] = [a - b for a, b in zip(flat, previous)]
        previous = flat
        frames.append(row)
    labels = [(label[6:] if label.startswith('/World') else label) for label in source['body_labels']]
    payload = dict(format='assembly-pose-delta-v1', pose_scales=SCALES,
                   body_labels=labels, frames=frames, layout=layout)
    raw = json.dumps(payload, separators=(',', ':'), allow_nan=False).encode()
    assert b'/sdf/' not in raw and b'/home/' not in raw
    assert max_error <= .00000050001
    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, mode='wb', compresslevel=9, mtime=0) as stream:
        stream.write(raw)
    packed = buffer.getvalue()
    target = ROOT / 'data' / (name + '.json.gz')
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(packed)
    return dict(id=name, file='data/' + target.name, frames=len(frames),
                duration_seconds=frames[-1]['time'], bytes=len(packed),
                sha256=hashlib.sha256(packed).hexdigest(), simulation=backend,
                model=model, maximum_position_quantization_error_m=max_error)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cover-recording', type=Path, required=True)
    parser.add_argument('--screw-recording', type=Path, required=True)
    args = parser.parse_args()
    cv = read(args.cover_recording / 'validation.json')
    cr = read(args.cover_recording / 'cover-result.json')
    assert cv['status'] == cr['status'] == 'success'
    assert cv['cover']['free_cover_entire_episode'] and cv['cover']['no_cover_attachment']
    assert cr['final_metrics']['completed'] and cr['peak_forces']['cover_N'] < 2
    cover = read(args.cover_recording / 'cover-motion.json')
    # End after physical release, withdrawal and verification. Exclude the old
    # handoff to a magnetic driver, which belongs to a different task.
    cover['frames'] = [f for f in cover['frames'] if f['time'] <= cr['placement_time']]
    assert cover['frames'][-1]['phase'] == 'cover_verify'
    assert cover['frames'][-1]['cover_metrics']['completed']
    assert all(not f['magnet_active'] for f in cover['frames'])
    scene = read(args.cover_recording / 'result.json')['scene']
    scene.update(driver_position=[-.085, .1, .68], tool_support_radius_m=.007,
                 tool_support_rounded=False, rack_style='cover')
    a = export(cover, 'cover', scene, 'Isaac Lab 3.0 / Newton / MuJoCo-Warp',
               'Free rigid cover, fixed brass base; no grasp attachment')
    del cover
    sv = read(args.screw_recording / 'validation.json')
    assert sv['passed'] and sv['full_assembly'] and sv['placed'] == sv['driven'] == 11
    assert sv['no_magnetic_attachment'] and sv['continuous_physical_tool_change']
    screws = read(args.screw_recording / 'replay.json')
    assert screws['frames'][-1]['phase'] == 'complete'
    order = screws['result']['requested_order']
    assert sorted(order) == list(range(11))
    for i in order:
        for phase in ['close_claws', 'carry', 'open_claws', 'driver_drive']:
            assert any(f['phase'] == phase and f['active_screw'] == i for f in screws['frames'])
    b = export(screws, 'screws', screws['layout'],
               'Native MuJoCo CPU using the audited Isaac Lab scene',
               'Mechanical under-head capture, fixed seated cover, seated screw retention; no magnet')
    a.update(title='Place the cover', offset_seconds=0)
    b.update(title='Place and drive the screws', offset_seconds=a['duration_seconds'] + 3)
    metadata = dict(format='assembly-chapters-v2', chapters=[a, b],
                    transition_seconds=3, requested_order=order,
                    duration_seconds=b['offset_seconds'] + b['duration_seconds'],
                    continuous_simulation=False,
                    controller='Scripted full-state / IK',
                    description='Two validated recordings with an explicit scene cut. No simulated handoff between chapters.',
                    limitations='Rigid bodies; no detailed threads, bending, tightening torque or preload.',
                    validation=dict(cover_placed=True, cover_peak_hand_force_N=cr['peak_forces']['cover_N'],
                                    screws_placed=11, screws_driven=11, no_magnetic_pickup=True))
    (ROOT / 'data/recording.json').write_text(json.dumps(metadata, indent=2) + '\n')
    obsolete = ROOT / 'data/assembly.json.gz'
    if obsolete.exists():
        obsolete.unlink()
    print(json.dumps(metadata, indent=2))


if __name__ == '__main__':
    main()
