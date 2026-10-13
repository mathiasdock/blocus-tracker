import GradientWave from "../ui/GradientWave";
import styles from "./GradientWaveEnvironment.module.css";

// The supplied Gradient Wave palette is intentionally independent of the
// Forest identity. Reuse its existing port rather than shipping another engine.
const COLORS = ["#38bdf8", "#ffffff", "#38bdf8", "#ffffff", "#38bdf8", "#ffffff"];
const NOISE_FREQUENCY = [0.0001, 0.0009];

export default function GradientWaveEnvironment({
  paused = false,
  isPlaying = true,
  className = "",
  noiseFrequency = NOISE_FREQUENCY,
  noiseSpeed = 0.0000032,
}) {
  return (
    <div className={`${styles.environment} ${className}`.trim()} data-paused={paused ? "true" : undefined} aria-hidden="true">
      <GradientWave className={styles.wave} colors={COLORS} fullColorLayers isPlaying={isPlaying && !paused}
        noiseFrequency={noiseFrequency} noiseSpeed={noiseSpeed} fps={30} scale={0.5} />
      <div className={styles.pause} />
      <div className={styles.veil} />
    </div>
  );
}
