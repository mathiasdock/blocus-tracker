import GradientWave from "../ui/GradientWave";
import styles from "./ZenithoEnvironment.module.css";

// UVCanvas 0.3.0 Zenitho uses the same Stripe/MiniGL shader already ported
// in GradientWave. Reuse that hardened renderer, not UVCanvas's MDX/Jotai
// dependency tree. Palette, noise/deformation and initial phase match Zenitho.
// Source: https://github.com/latentcat/uvcanvas (MIT), core/lib/components/zenitho.
const COLORS = ["#ef008f", "#6ec3f4", "#7038ff", "#ffba27"];
const NOISE_FREQUENCY = [0.00014, 0.00029];
const MESH_DENSITY = [0.06, 0.16];
const SPEED = 0.55;

export default function ZenithoEnvironment({ paused = false }) {
  return (
    <div className={styles.environment} data-paused={paused ? "true" : undefined} aria-hidden="true">
      <GradientWave className={styles.wave} colors={COLORS} isPlaying={!paused}
        planeOrientation="xz" meshDensity={MESH_DENSITY}
        noiseFrequency={NOISE_FREQUENCY} noiseSpeed={0.000005 * SPEED}
        seed={1253106 / SPEED} shadowPower={5} fps={30} scale={0.5} />
      <div className={styles.pause} />
      {paused && <div className={styles.pauseVeil} />}
    </div>
  );
}
