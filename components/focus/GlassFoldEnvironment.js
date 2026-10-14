import GlassFold from "../ui/GlassFold";
import styles from "./GlassFoldEnvironment.module.css";

export default function GlassFoldEnvironment({ paused = false, profile = false, isPlaying = true, fps = 30 }) {
  return <div className={styles.environment} data-paused={paused || undefined} aria-hidden="true">
    <GlassFold className={styles.wave} isPlaying={isPlaying && !paused} fps={fps} profile={profile} />
    <div className={styles.pause} />
  </div>;
}
