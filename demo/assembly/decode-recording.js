export function decodeRecording(data) {
  if (data.format !== 'assembly-pose-delta-v1') throw new Error('Unsupported recording format');
  const previous = new Int32Array(data.body_labels.length * 7);
  for (const frame of data.frames) {
    if (frame.poses_delta.length !== previous.length) throw new Error('Incomplete recording frame');
    for (let i = 0; i < previous.length; ++i) previous[i] += frame.poses_delta[i];
    frame.poses = data.body_labels.map((_, body) => Array.from({length: 7},
      (_, j) => previous[body * 7 + j] / data.pose_scales[j]));
    delete frame.poses_delta;
  }
  return data;
}
