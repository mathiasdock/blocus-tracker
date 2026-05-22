// Premium badge visuals — replaces emojis with real SVG medals/shields.
// Each badge has a category (color theme) + a glyph (line icon).
// Earned = colored + subtle shine. Locked = monochrome + low opacity.

const BADGE_VISUALS = {
  // ── Sessions / first ──
  first_session:    { theme: "gold",   shape: "star",     glyph: "star"    },
  // ── Streak ──
  streak_3:         { theme: "amber",  shape: "flame",    glyph: "flame"   },
  streak_7:         { theme: "orange", shape: "flame",    glyph: "bolt"    },
  streak_14:        { theme: "cyan",   shape: "flame",    glyph: "wave"    },
  streak_30:        { theme: "violet", shape: "flame",    glyph: "sparkle" },
  // ── Hours studied ──
  hours_10:         { theme: "green",  shape: "shield",   glyph: "book"    },
  hours_50:         { theme: "emerald",shape: "shield",   glyph: "cap"     },
  hours_100:        { theme: "gold",   shape: "trophy",   glyph: "trophy"  },
  hours_250:        { theme: "violet", shape: "trophy",   glyph: "crown"   },
  marathon_day:     { theme: "red",    shape: "shield",   glyph: "runner"  },
  // ── Planning ──
  planner:          { theme: "blue",   shape: "shield",   glyph: "calendar"},
  strategist:       { theme: "indigo", shape: "shield",   glyph: "target"  },
  blocus_architect: { theme: "violet", shape: "shield",   glyph: "tower"   },
  first_exam:       { theme: "blue",   shape: "shield",   glyph: "doc"     },
  // ── Social ──
  first_post:       { theme: "rose",   shape: "shield",   glyph: "camera"  },
  influencer:       { theme: "violet", shape: "shield",   glyph: "film"    },
  first_friend:     { theme: "green",  shape: "shield",   glyph: "hand"    },
  social:           { theme: "teal",   shape: "shield",   glyph: "users"   },
  motivator:        { theme: "pink",   shape: "shield",   glyph: "chat"    },
  team_spirit:      { theme: "orange", shape: "shield",   glyph: "fist"    },
  community_pillar: { theme: "emerald",shape: "trophy",   glyph: "globe"   },
  referrer:         { theme: "green",  shape: "star",     glyph: "users"   },
};

const THEMES = {
  gold:    { from: "#FCD34D", to: "#D97706", shine: "#FEF3C7", ring: "#D97706" },
  amber:   { from: "#FBBF24", to: "#B45309", shine: "#FEF3C7", ring: "#B45309" },
  orange:  { from: "#FB923C", to: "#C2410C", shine: "#FFEDD5", ring: "#C2410C" },
  red:     { from: "#F87171", to: "#B91C1C", shine: "#FEE2E2", ring: "#B91C1C" },
  rose:    { from: "#FB7185", to: "#BE123C", shine: "#FFE4E6", ring: "#BE123C" },
  pink:    { from: "#F472B6", to: "#9D174D", shine: "#FCE7F3", ring: "#9D174D" },
  violet:  { from: "#A78BFA", to: "#6D28D9", shine: "#EDE9FE", ring: "#6D28D9" },
  indigo:  { from: "#818CF8", to: "#3730A3", shine: "#E0E7FF", ring: "#3730A3" },
  blue:    { from: "#60A5FA", to: "#1D4ED8", shine: "#DBEAFE", ring: "#1D4ED8" },
  cyan:    { from: "#22D3EE", to: "#0E7490", shine: "#CFFAFE", ring: "#0E7490" },
  teal:    { from: "#2DD4BF", to: "#0F766E", shine: "#CCFBF1", ring: "#0F766E" },
  emerald: { from: "#34D399", to: "#047857", shine: "#D1FAE5", ring: "#047857" },
  green:   { from: "#4ADE80", to: "#15803D", shine: "#DCFCE7", ring: "#15803D" },
};

// ── Glyph (the icon drawn inside the shape) ─────────────────────────
function Glyph({ name, color, size }) {
  const s = size;
  const stroke = { stroke: color, strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" };
  const fill = { fill: color };
  switch (name) {
    case "star":     return <polygon {...fill} points={`${s/2},2 ${s*0.62},${s*0.38} ${s-2},${s*0.42} ${s*0.68},${s*0.62} ${s*0.78},${s-2} ${s/2},${s*0.78} ${s*0.22},${s-2} ${s*0.32},${s*0.62} 2,${s*0.42} ${s*0.38},${s*0.38}`} />;
    case "flame":    return <path {...fill} d={`M ${s/2} ${s*0.08} C ${s*0.78} ${s*0.32}, ${s*0.82} ${s*0.55}, ${s*0.66} ${s*0.78} C ${s*0.62} ${s*0.66}, ${s*0.56} ${s*0.62}, ${s*0.52} ${s*0.66} C ${s*0.56} ${s*0.86}, ${s*0.42} ${s*0.92}, ${s*0.32} ${s*0.82} C ${s*0.18} ${s*0.68}, ${s*0.22} ${s*0.46}, ${s/2} ${s*0.08} Z`} />;
    case "bolt":     return <polygon {...fill} points={`${s*0.55},2 ${s*0.18},${s*0.55} ${s*0.45},${s*0.55} ${s*0.32},${s-2} ${s*0.82},${s*0.42} ${s*0.55},${s*0.42}`} />;
    case "wave":     return <path {...stroke} d={`M 2 ${s*0.55} Q ${s*0.25} ${s*0.35}, ${s*0.5} ${s*0.55} T ${s-2} ${s*0.55}`} />;
    case "sparkle":  return <g><path {...fill} d={`M ${s/2} 2 L ${s*0.56} ${s*0.44} L ${s-2} ${s/2} L ${s*0.56} ${s*0.56} L ${s/2} ${s-2} L ${s*0.44} ${s*0.56} L 2 ${s/2} L ${s*0.44} ${s*0.44} Z`} /></g>;
    case "book":     return <g><path {...stroke} d={`M ${s*0.18} ${s*0.2} L ${s*0.18} ${s*0.82} L ${s/2} ${s*0.78} L ${s*0.82} ${s*0.82} L ${s*0.82} ${s*0.2} L ${s/2} ${s*0.24} Z`}/><line {...stroke} x1={s/2} y1={s*0.24} x2={s/2} y2={s*0.78} /></g>;
    case "cap":      return <g><polygon {...fill} points={`${s/2},${s*0.2} ${s*0.92},${s*0.42} ${s/2},${s*0.62} ${s*0.08},${s*0.42}`} /><path {...stroke} d={`M ${s*0.3} ${s*0.5} L ${s*0.3} ${s*0.72} Q ${s/2} ${s*0.82}, ${s*0.7} ${s*0.72} L ${s*0.7} ${s*0.5}`} /></g>;
    case "trophy":   return <g><path {...fill} d={`M ${s*0.32} ${s*0.18} L ${s*0.68} ${s*0.18} L ${s*0.68} ${s*0.48} Q ${s*0.68} ${s*0.66}, ${s/2} ${s*0.66} Q ${s*0.32} ${s*0.66}, ${s*0.32} ${s*0.48} Z`} /><rect {...fill} x={s*0.42} y={s*0.66} width={s*0.16} height={s*0.12} /><rect {...fill} x={s*0.3} y={s*0.78} width={s*0.4} height={s*0.06} rx="2" /></g>;
    case "crown":    return <g><path {...fill} d={`M ${s*0.1} ${s*0.4} L ${s*0.25} ${s*0.65} L ${s*0.35} ${s*0.32} L ${s/2} ${s*0.7} L ${s*0.65} ${s*0.32} L ${s*0.75} ${s*0.65} L ${s*0.9} ${s*0.4} L ${s*0.85} ${s*0.78} L ${s*0.15} ${s*0.78} Z`} /></g>;
    case "runner":   return <g><circle {...fill} cx={s*0.62} cy={s*0.2} r={s*0.08} /><path {...stroke} strokeWidth="2.8" d={`M ${s*0.62} ${s*0.32} L ${s*0.45} ${s*0.5} L ${s*0.3} ${s*0.5} M ${s*0.45} ${s*0.5} L ${s*0.55} ${s*0.7} L ${s*0.7} ${s*0.75} M ${s*0.55} ${s*0.7} L ${s*0.42} ${s*0.85}`} /></g>;
    case "calendar": return <g><rect {...stroke} x={s*0.18} y={s*0.22} width={s*0.64} height={s*0.62} rx="3" /><line {...stroke} x1={s*0.18} y1={s*0.38} x2={s*0.82} y2={s*0.38} /><line {...stroke} x1={s*0.32} y1={s*0.14} x2={s*0.32} y2={s*0.28} /><line {...stroke} x1={s*0.68} y1={s*0.14} x2={s*0.68} y2={s*0.28} /><polyline {...stroke} points={`${s*0.34},${s*0.58} ${s*0.46},${s*0.7} ${s*0.66},${s*0.5}`} /></g>;
    case "target":   return <g><circle {...stroke} cx={s/2} cy={s/2} r={s*0.32} /><circle {...stroke} cx={s/2} cy={s/2} r={s*0.18} /><circle {...fill} cx={s/2} cy={s/2} r={s*0.06} /></g>;
    case "tower":    return <g><polygon {...fill} points={`${s/2},${s*0.12} ${s*0.78},${s*0.32} ${s*0.78},${s*0.86} ${s*0.22},${s*0.86} ${s*0.22},${s*0.32}`} /><rect fill={color === "#fff" ? "rgba(0,0,0,0.35)" : "#fff"} x={s*0.42} y={s*0.5} width={s*0.16} height={s*0.36} opacity="0.5" /></g>;
    case "doc":      return <g><path {...stroke} d={`M ${s*0.28} ${s*0.16} L ${s*0.6} ${s*0.16} L ${s*0.76} ${s*0.32} L ${s*0.76} ${s*0.84} L ${s*0.28} ${s*0.84} Z`} /><polyline {...stroke} points={`${s*0.6},${s*0.16} ${s*0.6},${s*0.32} ${s*0.76},${s*0.32}`} /><line {...stroke} x1={s*0.38} y1={s*0.5} x2={s*0.66} y2={s*0.5} /><line {...stroke} x1={s*0.38} y1={s*0.62} x2={s*0.66} y2={s*0.62} /></g>;
    case "camera":   return <g><rect {...stroke} x={s*0.16} y={s*0.32} width={s*0.68} height={s*0.46} rx="4" /><circle {...stroke} cx={s/2} cy={s*0.56} r={s*0.14} /><path {...fill} d={`M ${s*0.36} ${s*0.32} L ${s*0.4} ${s*0.22} L ${s*0.6} ${s*0.22} L ${s*0.64} ${s*0.32} Z`} /></g>;
    case "film":     return <g><rect {...stroke} x={s*0.18} y={s*0.24} width={s*0.64} height={s*0.52} rx="3" /><line {...stroke} x1={s*0.18} y1={s*0.4} x2={s*0.82} y2={s*0.4} /><line {...stroke} x1={s*0.18} y1={s*0.6} x2={s*0.82} y2={s*0.6} /><circle {...fill} cx={s*0.28} cy={s*0.32} r="1.5" /><circle {...fill} cx={s*0.28} cy={s*0.5} r="1.5" /><circle {...fill} cx={s*0.28} cy={s*0.68} r="1.5" /><circle {...fill} cx={s*0.72} cy={s*0.32} r="1.5" /><circle {...fill} cx={s*0.72} cy={s*0.5} r="1.5" /><circle {...fill} cx={s*0.72} cy={s*0.68} r="1.5" /></g>;
    case "hand":     return <g><path {...fill} d={`M ${s*0.18} ${s*0.5} L ${s*0.36} ${s*0.32} L ${s*0.5} ${s*0.5} L ${s*0.64} ${s*0.32} L ${s*0.82} ${s*0.5} L ${s*0.72} ${s*0.7} L ${s*0.28} ${s*0.7} Z`} /></g>;
    case "users":    return <g><circle {...fill} cx={s*0.36} cy={s*0.36} r={s*0.12} /><circle {...fill} cx={s*0.64} cy={s*0.36} r={s*0.12} /><path {...fill} d={`M ${s*0.18} ${s*0.78} Q ${s*0.36} ${s*0.55}, ${s*0.5} ${s*0.78} Q ${s*0.64} ${s*0.55}, ${s*0.82} ${s*0.78} L ${s*0.82} ${s*0.84} L ${s*0.18} ${s*0.84} Z`} /></g>;
    case "chat":     return <g><path {...stroke} d={`M ${s*0.16} ${s*0.3} Q ${s*0.16} ${s*0.22}, ${s*0.24} ${s*0.22} L ${s*0.76} ${s*0.22} Q ${s*0.84} ${s*0.22}, ${s*0.84} ${s*0.3} L ${s*0.84} ${s*0.58} Q ${s*0.84} ${s*0.66}, ${s*0.76} ${s*0.66} L ${s*0.5} ${s*0.66} L ${s*0.36} ${s*0.82} L ${s*0.36} ${s*0.66} L ${s*0.24} ${s*0.66} Q ${s*0.16} ${s*0.66}, ${s*0.16} ${s*0.58} Z`} /></g>;
    case "fist":     return <g><rect {...fill} x={s*0.24} y={s*0.38} width={s*0.52} height={s*0.36} rx={s*0.08} /><rect {...fill} x={s*0.3} y={s*0.28} width={s*0.06} height={s*0.18} /><rect {...fill} x={s*0.4} y={s*0.24} width={s*0.06} height={s*0.22} /><rect {...fill} x={s*0.5} y={s*0.24} width={s*0.06} height={s*0.22} /><rect {...fill} x={s*0.6} y={s*0.28} width={s*0.06} height={s*0.18} /></g>;
    case "globe":    return <g><circle {...stroke} cx={s/2} cy={s/2} r={s*0.34} /><ellipse {...stroke} cx={s/2} cy={s/2} rx={s*0.16} ry={s*0.34} /><line {...stroke} x1={s*0.16} y1={s/2} x2={s*0.84} y2={s/2} /></g>;
    default:         return <circle {...fill} cx={s/2} cy={s/2} r={s*0.2} />;
  }
}

// ── Shape (the outer frame: shield / star / trophy / flame) ─────────
function Shape({ shape, fillId, strokeColor, size }) {
  const s = size;
  switch (shape) {
    case "shield":
      return <path d={`M ${s/2} 1 L ${s-2} ${s*0.18} L ${s-2} ${s*0.55} Q ${s-2} ${s*0.86}, ${s/2} ${s-1} Q 2 ${s*0.86}, 2 ${s*0.55} L 2 ${s*0.18} Z`}
        fill={`url(#${fillId})`} stroke={strokeColor} strokeWidth="1.5" />;
    case "star":
      return <polygon points={`${s/2},2 ${s*0.62},${s*0.36} ${s-2},${s*0.4} ${s*0.7},${s*0.6} ${s*0.78},${s-2} ${s/2},${s*0.78} ${s*0.22},${s-2} ${s*0.3},${s*0.6} 2,${s*0.4} ${s*0.38},${s*0.36}`}
        fill={`url(#${fillId})`} stroke={strokeColor} strokeWidth="1.5" />;
    case "trophy":
      return <path d={`M ${s*0.1} ${s*0.1} L ${s*0.9} ${s*0.1} L ${s*0.9} ${s*0.5} Q ${s*0.9} ${s*0.82}, ${s/2} ${s*0.92} Q ${s*0.1} ${s*0.82}, ${s*0.1} ${s*0.5} Z`}
        fill={`url(#${fillId})`} stroke={strokeColor} strokeWidth="1.5" />;
    case "flame":
      return <path d={`M ${s/2} 1 C ${s*0.92} ${s*0.3}, ${s} ${s*0.62}, ${s*0.78} ${s*0.92} C ${s*0.7} ${s*0.78}, ${s*0.58} ${s*0.78}, ${s*0.54} ${s*0.86} C ${s*0.6} ${s*0.98}, ${s*0.4} ${s} , ${s*0.3} ${s*0.92} C 0 ${s*0.7}, ${s*0.08} ${s*0.3}, ${s/2} 1 Z`}
        fill={`url(#${fillId})`} stroke={strokeColor} strokeWidth="1.5" />;
    default:
      return <circle cx={s/2} cy={s/2} r={s/2 - 1} fill={`url(#${fillId})`} stroke={strokeColor} strokeWidth="1.5" />;
  }
}

/**
 * Premium badge visual.
 * @param {string} id        — badge id (from lib/badges.js)
 * @param {boolean} earned   — true if user has earned it
 * @param {number} size      — outer size in px (default 36)
 * @param {boolean} animate  — shine animation (for newly unlocked)
 */
export default function BadgeIcon({ id, earned = false, size = 36, animate = false }) {
  const v = BADGE_VISUALS[id] || { theme: "green", shape: "shield", glyph: "star" };
  const theme = THEMES[v.theme] || THEMES.green;
  const uid = `bi-${id}`;
  const fillId = `${uid}-fill`;
  const shineId = `${uid}-shine`;
  const glyphColor = "#ffffff";

  return (
    <span
      className={animate && earned ? "badge-shine" : ""}
      style={{
        display: "inline-flex",
        width: size,
        height: size,
        filter: earned ? "drop-shadow(0 2px 6px rgba(0,0,0,0.18))" : "grayscale(1)",
        opacity: earned ? 1 : 0.35,
        transition: "opacity 0.2s, filter 0.2s, transform 0.15s",
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme.from} />
            <stop offset="100%" stopColor={theme.to} />
          </linearGradient>
          <linearGradient id={shineId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme.shine} stopOpacity="0.8" />
            <stop offset="60%" stopColor={theme.shine} stopOpacity="0" />
          </linearGradient>
        </defs>
        <Shape shape={v.shape} fillId={fillId} strokeColor={theme.ring} size={size} />
        {/* highlight */}
        <Shape shape={v.shape} fillId={shineId} strokeColor="transparent" size={size} />
        {/* glyph centered */}
        <g transform={`translate(${size * 0.18}, ${size * 0.18})`}>
          <Glyph name={v.glyph} color={glyphColor} size={size * 0.64} />
        </g>
      </svg>
    </span>
  );
}
