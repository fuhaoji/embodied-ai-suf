"""Remove research labels from the fixed 960x720 recording overlay.

The source badge already covers this rectangle. Replace it with the scene's
background and use a generic subtitle; do not alter the simulated motion.
Requires the bundled recording layout and FFmpeg with drawtext support.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import subprocess

FILTER = (
    'drawbox=x=0:y=43:w=960:h=40:color=0x13263b:t=fill,'
    'drawbox=x=18:y=104:w=924:h=66:color=0xe8edf2:t=fill,'
    "drawtext=fontfile={font}:text='Tool-use simulation - Actual-time playback':"
    'x=24:y=51:fontsize=14:fontcolor=0xc2d1df'
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ffmpeg', default='ffmpeg')
    parser.add_argument('--font', default='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
    parser.add_argument('--source-docs', required=True, type=Path)
    parser.add_argument('--output-docs', required=True, type=Path)
    args = parser.parse_args()
    assert Path(args.font).is_file()
    assert args.source_docs.resolve() != args.output_docs.resolve(), 'Keep an unmodified source copy'
    manifest = json.loads((args.source_docs / 'data/gallery.json').read_text())
    vf = FILTER.format(font=args.font)

    def run(arguments):
        subprocess.run([args.ffmpeg, '-nostdin', '-y', '-loglevel', 'error'] + arguments,
                       check=True, timeout=300)

    def clean(case):
        source, target = args.source_docs, args.output_docs
        for key in ['mp4', 'vp8', 'poster']:
            (target / case[key]).parent.mkdir(parents=True, exist_ok=True)
        mp4, vp8, poster = [target / case[key] for key in ['mp4', 'vp8', 'poster']]
        run(['-i', str(source / case['mp4']), '-vf', vf, '-an', '-c:v', 'libx264',
             '-preset', 'fast', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
             '-threads', '2', str(mp4)])
        run(['-i', str(mp4), '-an', '-c:v', 'libvpx', '-b:v', '1500k', '-crf', '10',
             '-deadline', 'realtime', '-cpu-used', '8', '-threads', '2', '-g', '60',
             '-auto-alt-ref', '0', '-pix_fmt', 'yuv420p', str(vp8)])
        run(['-i', str(source / case['poster']), '-vf', vf, '-frames:v', '1', str(poster)])
        for video in [mp4, vp8]:
            run(['-i', str(video), '-f', 'null', '-'])
        print('CLEANED', case['id'], flush=True)
        return {key: hashlib.sha256((target / case[key]).read_bytes()).hexdigest()
                for key in ['mp4', 'vp8', 'poster']}

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(clean, manifest['cases']))
    print(json.dumps(dict(status='passed', videos=48, posters=24, sha256=results)))


if __name__ == '__main__':
    main()
