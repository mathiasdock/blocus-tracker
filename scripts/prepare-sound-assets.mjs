// Offline media preparation only; no ElevenLabs credentials or runtime dependency.
// Usage: node scripts/prepare-sound-assets.mjs /absolute/candidate/directory
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { statSync } from "node:fs";

const root = process.argv[2];
if (!root) throw new Error("Provide the selected candidate directory.");
const selections = [
  ["01_session_complete_v1.mp3", "bt-session-complete.mp3"],
  ["02_pomodoro_break_finished_v2.mp3", "bt-break-end.mp3"],
  ["03_achievement_v2.mp3", "bt-achievement.mp3"],
  ["04_level_up_v1.mp3", "bt-level-up.mp3"],
  ["05_social_incoming_v3_double_ping.mp3", "bt-social-incoming.mp3"],
];
const target = -23;
const mono = "aformat=channel_layouts=mono";
function ffmpeg(args) {
  const result = spawnSync("ffmpeg", ["-hide_banner", ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stderr;
}
function measure(file, filters = []) {
  const log = ffmpeg(["-i", file, "-af", [...filters, "loudnorm=I=-23:TP=-3:LRA=7:print_format=json"].join(","), "-f", "null", "-"]);
  return JSON.parse(log.match(/\{\s*"input_i"[\s\S]*?\}/)[0]);
}
const report = [];
for (const [candidate, asset] of selections) {
  const input = resolve(root, candidate);
  const output = resolve("public/sounds", asset);
  const original = measure(input, [mono]);
  let gain = target - Number(original.input_i);
  if (!Number.isFinite(gain)) throw new Error(`Cannot measure ${candidate}`);
  let final;
  // Gain only: retain the chosen timbre/envelope. Correct codec/gating rounding
  // against the final compressed file rather than trusting a peak-only match.
  for (let attempt = 0; attempt < 3; attempt++) {
    ffmpeg(["-y", "-i", input, "-map_metadata", "-1", "-af", `${mono},volume=${gain}dB`,
      "-ar", "44100", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "64k", output]);
    final = measure(output);
    const error = target - Number(final.input_i);
    if (Math.abs(error) <= 0.25) break;
    gain += error;
  }
  if (Math.abs(target - Number(final.input_i)) > 0.5 || Number(final.input_tp) > -3) {
    throw new Error(`Loudness/headroom check failed for ${asset}: ${JSON.stringify(final)}`);
  }
  report.push({ candidate, asset, gainDb: Number(gain.toFixed(2)),
    lufs: Number(final.input_i), truePeakDb: Number(final.input_tp), bytes: statSync(output).size });
}
console.log(JSON.stringify(report, null, 2));
