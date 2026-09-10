import { useEffect, useRef } from "react";
import { createMascotDirector, poseForMood, resolveMascotMood } from "../lib/mascotMotion.mjs";

export { mascotState, poseForMood, MASCOT_MOODS } from "../lib/mascotMotion.mjs";

const FUR = "#E0A458";
const LIGHT = "#EDB86F";
const SHADE = "#C98942";
const CREAM = "#F8EACB";
const DARK = "#39291F";
const PINK = "#EB9B99";
const GREEN = "#14B885";
const INK = "#0B2E23";

export const MASCOT_CAPTION_KEY = {
  asleep: "mascot.asleep", content: "mascot.content", happy: "mascot.happy", fired: "mascot.fired",
};

// New vector artwork, built for articulation. Pose wrappers hold an emotion;
// the director moves the nested joints without replacing the resting pose.
function Arm({ side }) {
  const left = side === "left";
  return (
    <g className={`bt-m-arm-pose bt-m-arm-pose--${side}`}>
      <g data-mascot-part={`arm-${side}`}>
        <path d={left
          ? "M55 94 C46 91 39 99 38 110 Q39 119 48 120 Q57 121 61 108 L62 102 Q63 97 55 94Z"
          : "M105 94 C114 91 121 99 122 110 Q121 119 112 120 Q103 121 99 108 L98 102 Q97 97 105 94Z"} fill={FUR} />
        <g className={`bt-m-forearm-pose bt-m-forearm-pose--${side}`}>
          <g data-mascot-part={`forearm-${side}`}>
            <path d={left
              ? "M39 106 Q48 103 56 110 L57 119 C57 132 38 132 36 121 Q34 113 39 106Z"
              : "M121 106 Q112 103 104 110 L103 119 C103 132 122 132 124 121 Q126 113 121 106Z"} fill={FUR} />
            <path d={left
              ? "M36 117 Q45 113 57 119 C58 131 39 133 36 121Z"
              : "M124 117 Q115 113 103 119 C102 131 121 133 124 121Z"} fill={CREAM} />
            <path d={left ? "M43 123 L43 126 M49 123 L49 126" : "M117 123 L117 126 M111 123 L111 126"}
              stroke={SHADE} strokeWidth="1.2" strokeLinecap="round" opacity=".55" />
          </g>
        </g>
      </g>
    </g>
  );
}

function Eyes({ emotion }) {
  if (emotion === "sleepy") return (
    <g stroke={DARK} strokeWidth="3.5" strokeLinecap="round">
      <path d="M54 59 Q63 66 71 59" /><path d="M89 59 Q97 66 106 59" />
    </g>
  );
  if (emotion === "celebrating" || emotion === "proud") return (
    <g stroke={DARK} strokeWidth="3.7" strokeLinecap="round">
      <path d="M54 59 Q63 47 71 59" /><path d="M89 59 Q97 47 106 59" />
    </g>
  );
  const surprised = emotion === "surprised";
  return (
    <>
      <ellipse cx="63" cy="57" rx={surprised ? 11 : 10} ry={surprised ? 14 : 12} fill="#FFFDF7" />
      <ellipse cx="97" cy="57" rx={surprised ? 11 : 10} ry={surprised ? 14 : 12} fill="#FFFDF7" />
      <g data-mascot-part="gaze">
        <ellipse cx="65" cy="58" rx="5.5" ry={surprised ? 7.5 : 8} fill={DARK} />
        <ellipse cx="95" cy="58" rx="5.5" ry={surprised ? 7.5 : 8} fill={DARK} />
        <circle cx="63.5" cy="54.5" r="2" fill="white" /><circle cx="93.5" cy="54.5" r="2" fill="white" />
        <circle cx="67" cy="61.5" r=".9" fill={CREAM} /><circle cx="97" cy="61.5" r=".9" fill={CREAM} />
      </g>
      {emotion === "focused" && <>
        <path d="M52 44 L74 49 L74 52 L52 49Z M86 49 L108 44 L108 49 L86 52Z" fill={FUR} />
        <path d="M55 49 L71 51 M89 51 L105 49" stroke={DARK} strokeWidth="1.6" strokeLinecap="round" />
      </>}
    </>
  );
}

function Mouth({ emotion }) {
  if (emotion === "surprised") return <ellipse cx="80" cy="83" rx="5.5" ry="7" fill={DARK} />;
  if (emotion === "worried") return <path d="M73 84 Q80 78 87 84" stroke={DARK} strokeWidth="2.6" strokeLinecap="round" />;
  if (emotion === "sleepy") return (
    <g>
      <path className="bt-m-mouth-rest" d="M75 81 Q80 84 85 81" stroke={DARK} strokeWidth="2.4" strokeLinecap="round" />
      <ellipse className="bt-m-mouth-yawn" cx="80" cy="83" rx="6" ry="8" fill={DARK} />
    </g>
  );
  if (emotion === "happy" || emotion === "celebrating") return (
    <g data-mascot-part="mouth">
      <path d="M67 77 Q80 83 93 77 C92 95 70 95 67 77Z" fill={DARK} />
      <path d="M73 87 Q80 81 87 87 Q80 95 73 87Z" fill={PINK} />
      <path d="M72 79 Q80 82 88 79" stroke={CREAM} strokeWidth="2" strokeLinecap="round" />
    </g>
  );
  return <path d="M80 75 L80 79 M69 79 Q74 85 80 79 Q86 85 91 78" stroke={DARK} strokeWidth="2.4" strokeLinecap="round" />;
}

export default function Mascot({
  streak = 0, mood, size = 96, className = "", ariaLabel, animated = true, reactionKey,
}) {
  const svgRef = useRef(null);
  const directorRef = useRef(null);
  const state = poseForMood(mood, streak);
  const emotion = resolveMascotMood(mood, streak);

  useEffect(() => {
    const director = createMascotDirector(svgRef.current);
    directorRef.current = director;
    return () => { director.dispose(); directorRef.current = null; };
  }, []);
  useEffect(() => {
    directorRef.current?.update({ mood: emotion, animated, reactionKey });
  }, [emotion, animated, reactionKey]);

  return (
    <svg ref={svgRef} width={size} height={size} viewBox="0 0 160 160" fill="none"
      role="img" aria-label={ariaLabel || "Mascotte"} focusable="false"
      className={`bt-m ${className}`} data-design="shiba-articulated" data-mood={emotion}
      data-motion="static" data-animated={animated} style={{ overflow: "visible" }}>
      <ellipse data-mascot-part="shadow" cx="80" cy="150" rx="32" ry="4.5" fill={INK} opacity=".1" />
      <g data-mascot-part="action">
        <g className="bt-m-posture">
          <g className="bt-m-leg-pose bt-m-leg-pose--left">
            <g data-mascot-part="leg-left">
              <path d="M59 126 Q67 120 75 128 L75 143 Q67 153 56 145Z" fill={SHADE} />
              <path d="M59 137 C47 137 47 151 59 151 L71 151 Q79 149 76 141 Q69 135 59 137Z" fill={CREAM} />
              <path d="M57 145 L57 148 M63 145 L63 149" stroke={SHADE} strokeWidth="1.4" strokeLinecap="round" />
            </g>
          </g>
          <g className="bt-m-leg-pose bt-m-leg-pose--right">
            <g data-mascot-part="leg-right">
              <path d="M101 126 Q93 120 85 128 L85 143 Q93 153 104 145Z" fill={SHADE} />
              <path d="M101 137 C113 137 113 151 101 151 L89 151 Q81 149 84 141 Q91 135 101 137Z" fill={CREAM} />
              <path d="M103 145 L103 148 M97 145 L97 149" stroke={SHADE} strokeWidth="1.4" strokeLinecap="round" />
            </g>
          </g>
          <g data-mascot-part="breath">
            <g className="bt-m-tail-pose">
              <g data-mascot-part="tail">
                <path d="M97 130 C124 140 145 121 144 101 C143 83 125 78 116 87 C107 96 112 110 123 109 Q132 109 130 99 C139 111 126 126 104 116Z" fill={SHADE} />
                <path d="M116 87 C125 78 143 83 144 101 Q145 114 137 122 L129 113 Q135 106 130 99 Q132 109 123 109 C112 110 107 96 116 87Z" fill={CREAM} />
                <path d="M98 119 Q115 129 129 120" stroke={FUR} strokeWidth="8" strokeLinecap="round" />
              </g>
            </g>
            <path d="M59 88 C48 103 47 123 58 136 Q80 145 102 136 C114 122 111 103 101 88Z" fill={FUR} />
            <path d="M70 103 Q80 98 92 105 C102 116 101 128 95 135 Q80 143 65 133 C59 123 60 111 70 103Z" fill={CREAM} />
            <path d="M58 91 Q80 101 102 91 L102 102 Q80 114 58 103Z" fill={GREEN} />
            <path d="M69 103 L90 106 L78 121 Q73 115 69 103Z" fill={GREEN} />
            <path d="M90 106 L78 121 L81 109Z" fill={INK} opacity=".18" />
            <circle cx="83" cy="104" r="4.2" fill={CREAM} />

            <g className="bt-m-head-pose">
              <g data-mascot-part="head">
                <g className="bt-m-ear-pose bt-m-ear-pose--left">
                  <g data-mascot-part="ear-left">
                    <path d="M43 51 C36 37 38 14 45 11 C52 10 65 25 70 40Z" fill={FUR} />
                    <path d="M45 39 Q42 29 46 21 Q54 25 61 38Z" fill={SHADE} />
                    <path d="M46 35 L47 25 L56 36Z" fill={PINK} />
                  </g>
                </g>
                <g className="bt-m-ear-pose bt-m-ear-pose--right">
                  <g data-mascot-part="ear-right">
                    <path d="M117 51 C124 37 122 14 115 11 C108 10 95 25 90 40Z" fill={FUR} />
                    <path d="M115 39 Q118 29 114 21 Q106 25 99 38Z" fill={SHADE} />
                    <path d="M114 35 L113 25 L104 36Z" fill={PINK} />
                  </g>
                </g>
                <path d="M80 30 C100 29 115 40 119 55 L124 65 L120 67 L126 73 L117 79 C108 91 94 96 80 95 C64 96 52 90 43 79 L35 73 L41 67 L37 65 L42 55 C45 40 60 30 80 30Z" fill={FUR} />
                <path d="M51 43 Q60 32 75 32 L79 27 L85 31 L91 29 L94 34 Q106 37 111 44 Q80 37 51 43Z" fill={LIGHT} />
                <path d="M43 65 C51 59 60 65 65 71 Q80 63 95 71 C101 65 110 59 119 65 C121 80 105 94 80 94 C56 93 42 80 43 65Z" fill={CREAM} />
                <ellipse cx="50" cy="73" rx="6" ry="3.2" fill={PINK} opacity=".43" />
                <ellipse cx="110" cy="73" rx="6" ry="3.2" fill={PINK} opacity=".43" />
                <path className="bt-m-brow-left" d="M55 43 Q62 39 69 42" stroke={CREAM} strokeWidth="5" strokeLinecap="round" />
                <path className="bt-m-brow-right" d="M91 42 Q98 39 105 43" stroke={CREAM} strokeWidth="5" strokeLinecap="round" />
                <g className="bt-m-eye-expression"><g data-mascot-part="eyes"><Eyes emotion={emotion} /></g></g>
                <path d="M74 68 Q80 65 86 68 C89 71 83 76 80 76 C77 76 71 71 74 68Z" fill={DARK} />
                <path d="M77 68.5 Q80 67.5 83 68.5" stroke="#69503D" strokeWidth="1.6" strokeLinecap="round" />
                <Mouth emotion={emotion} />
              </g>
            </g>

            {emotion === "focused" && (
              <g data-mascot-part="prop" aria-hidden="true">
                <path d="M54 114 Q68 110 80 117 Q92 110 106 114 L106 139 Q93 137 80 143 Q67 137 54 139Z" fill={INK} />
                <path d="M57 114 Q68 112 78 118 L78 139 Q68 135 57 136Z" fill={CREAM} />
                <path d="M82 118 Q92 112 103 114 L103 136 Q92 135 82 139Z" fill="#FFFDF7" />
                <path d="M62 121 L72 123 M62 126 L71 128 M88 123 L98 121 M88 128 L98 126" stroke={SHADE} strokeWidth="1.4" strokeLinecap="round" />
                <path d="M94 114 L98 113 L98 124 L96 122 L94 125Z" fill={GREEN} />
              </g>
            )}
            <Arm side="left" /><Arm side="right" />
          </g>
        </g>
        {emotion === "sleepy" && <g data-mascot-part="sleep" fill={INK} fontWeight="800" opacity=".5" aria-hidden="true">
          <text x="120" y="48" fontSize="10">z</text><text x="131" y="34" fontSize="14">z</text>
        </g>}
        {state === "fired" && emotion !== "celebrating" && <g transform="translate(125 35) scale(.8)" aria-hidden="true">
          <path d="M12 0 C16 10 23 12 21 20 C19 29 3 29 2 20 Q0 15 6 10 Q5 17 10 17 Q15 15 12 0Z" fill="#F5BE46" />
        </g>}
      </g>
      <g data-mascot-part="sparkles" opacity="0" aria-hidden="true" fill="#EDB449">
        <path d="M22 43 L25 51 L33 54 L25 57 L22 65 L19 57 L11 54 L19 51Z" />
        <path d="M136 21 L139 29 L147 32 L139 35 L136 43 L133 35 L125 32Z" />
        <circle cx="24" cy="91" r="3" fill={GREEN} /><circle cx="143" cy="74" r="3" fill={GREEN} />
      </g>
    </svg>
  );
}
