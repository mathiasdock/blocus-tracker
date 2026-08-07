import Image from "next/image";

export default function AuthBrand({ subtitle, compact = false }) {
  const logoSize = compact ? 32 : 38;

  return (
    <div className={`text-center ${compact ? "mb-6" : "mb-7"}`}>
      <div className="inline-flex items-center justify-center gap-2.5">
        <Image
          src="/logo-transparent.png"
          alt=""
          width={logoSize}
          height={logoSize}
          priority
          className="shrink-0 dark:invert"
        />
        <span
          className={`${compact ? "text-2xl" : "text-[2rem]"} font-display font-bold leading-none`}
          style={{ color: "var(--bt-text-1)" }}
        >
          blocus<span className="text-accent">·</span>tracker
        </span>
      </div>
      {subtitle && (
        <p className="mx-auto mt-2 max-w-xs text-sm font-medium leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
