// Sober shimmer skeletons — reuse the .bt-skeleton utility (globals.css),
// which respects prefers-reduced-motion (sweep disabled, static block stays).

export function SkeletonBar({ width = "100%", height = 12, className = "", style = {} }) {
  return <span className={`bt-skeleton block ${className}`} style={{ width, height, borderRadius: 8, ...style }} />;
}

export function SkeletonCircle({ size = 32, className = "" }) {
  return <span className={`bt-skeleton block shrink-0 ${className}`} style={{ width: size, height: size, borderRadius: "50%" }} />;
}

// A row shaped like an avatar list item (leaderboard, conversations, members).
export function SkeletonRow({ avatar = 32, lines = 2 }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <SkeletonCircle size={avatar} />
      <div className="flex-1 min-w-0 space-y-1.5">
        <SkeletonBar width="55%" height={10} />
        {lines > 1 && <SkeletonBar width="35%" height={8} />}
      </div>
    </div>
  );
}

export function SkeletonList({ rows = 6, avatar = 32, lines = 2 }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} avatar={avatar} lines={lines} />
      ))}
    </div>
  );
}
