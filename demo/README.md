# Tool-use demo

This self-contained static website shares 24 selected successful DexToolBench
trajectories from our experiment 023 policy, with downloadable MP4/WebM videos,
browser-based 3D replays, tool-family filters, and direct links to individual tasks.
No backend, policy checkpoint, simulator installation, or compute-cluster access
is required to view it. The 3D view uses the visitor's browser WebGL support.
The viewer and videos omit experiment, checkpoint, seed, and trial labels;
provenance is retained in the data manifest for maintenance.

For each task, the gallery uses the checkpoint with the higher completion count
in the existing 166B and 172B ten-trial evaluations, keeping 166B on ties. Each
clip is the lowest-index successful trial in that checkpoint's original batch.
Eight clips use 172B; sixteen use 166B. These are curated successes, not an
unbiased estimate of task success. Per-clip provenance is in
[`data/gallery.json`](data/gallery.json).

The videos and 3D views replay recorded Isaac Gym / PhysX poses. They show rigid
tool pose tracking; effects such as bristle flex, cleaning, ink deposition, or
nail insertion are not simulated. See the website's completion criteria and
[`attribution notices`](notices.html).

### Publish with GitHub Pages

After the files are pushed, a repository administrator can enable **Settings →
Pages → Build and deployment → Deploy from a branch → main → /(root) → Save**.
The intended public address is:

https://fuhaoji.github.io/embodied-ai-suf/demo/

Each task can be shared directly, for example:

https://fuhaoji.github.io/embodied-ai-suf/demo/#task=hammer__mallet_hammer__swing_down

GitHub Pages branch publishing supports the repository root or `/docs`.
Select the repository root to serve this folder at `/demo/`. GitHub Pages must
be enabled before these URLs become available.

### Preview and check

Run these commands from the `demo` folder.

```bash
python3 -m http.server 8021 --bind 127.0.0.1 --directory .
```

Open http://localhost:8021/ (forward port 8021 when working remotely).
Keep the existing simulation demo on port 8020 separate.

```bash
python3 tools/validate_site.py
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node tools/check_browser.cjs
```

The browser check tests the GitHub Pages project subpath, all 24 videos, seeking,
codec fallback, filters, search, sharing, representative 3D replays, mobile layout,
and the VS Code iframe sandbox. Screenshots and the report go to
`/tmp/embodied-ai-site-check` unless `ARTIFACT_DIR` is set.

To refresh the gallery from compatible verified recording directories:

```bash
python3 tools/update_gallery.py --baseline /path/to/baseline/tasks --updates /path/to/replacement/tasks
python3 tools/validate_site.py
```

The packager copies only public media and portable recorded poses. It removes
the simulator's local robot path and never packages checkpoints or training logs.
For recordings with the original research overlay, preserve a copy of the
packaged `demo` directory and run the label cleanup before publication:

```bash
python3 tools/clean_media.py --source-docs /path/to/packaged-copy --output-docs .
```

This requires FFmpeg with drawtext support and a DejaVu Sans font (override
`--ffmpeg` and `--font` for local installations). It removes only the fixed source
badge and replaces the research subtitle, preserving the motion and timing.
