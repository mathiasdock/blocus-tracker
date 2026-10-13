import dynamic from "next/dynamic";
import FocusShaderBackground from "../FocusShaderBackground";

const GradientWaveEnvironment = dynamic(() => import("./GradientWaveEnvironment"), { ssr: false });
const RENDERERS = { forest: FocusShaderBackground, "gradient-wave": GradientWaveEnvironment };

// Exactly one renderer is mounted. Forest remains its original component.
export default function FocusEnvironmentRenderer({ environment, paused }) {
  const Renderer = RENDERERS[environment.renderer] || FocusShaderBackground;
  return <Renderer key={environment.id} paused={paused} />;
}
