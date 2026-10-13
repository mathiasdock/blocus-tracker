import GlassFold from "../ui/GlassFold";
import styles from "./GlassFoldEnvironment.module.css";

export default function GlassFoldEnvironment({ paused = false, profile = false }) {
  return <div className={styles.environment} data-paused={paused || undefined} aria-hidden="true">
    <GlassFold className={styles.wave} isPlaying={!paused} profile={profile} />
    <div className={styles.pause} />
  </div>;
}
