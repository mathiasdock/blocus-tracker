import dynamic from "next/dynamic";
import FocusShaderBackground from "../FocusShaderBackground";

const GradientWaveEnvironment = dynamic(() => import("./GradientWaveEnvironment"), { ssr: false });
const ZenithoEnvironment = dynamic(() => import("./ZenithoEnvironment"), { ssr: false });
const GlassFoldEnvironment = dynamic(() => import("./GlassFoldEnvironment"), { ssr: false });
const RENDERERS = { forest: FocusShaderBackground, "gradient-wave": GradientWaveEnvironment, zenitho: ZenithoEnvironment, "glass-fold": GlassFoldEnvironment };

// Exactly one renderer is mounted. Forest remains its original component.
export default function FocusEnvironmentRenderer({ environment, paused, isPlaying = true, compact = false }) {
  const Renderer = RENDERERS[environment.renderer] || FocusShaderBackground;
  return <Renderer key={environment.id} paused={paused} isPlaying={isPlaying}
    {...(compact ? { fps: 24, maxDpr: 1 } : {})} />;
}
