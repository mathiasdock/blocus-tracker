import { useState, useRef, useEffect } from "react";
import { COUNTRIES } from "../lib/universities";

export default function UniPicker({ value, onChange, disabled, placeholder }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // If the short name isn't already in the full name, prefix it: "ULB - Université Libre de Bruxelles"
  function dropdownLabel(u) {
    if (u.full.toLowerCase().includes(u.name.toLowerCase())) return u.full;
    return `${u.name} – ${u.full}`;
  }

  const q = query.trim().toLowerCase();
  const filtered = COUNTRIES
    .map(country => ({
      ...country,
      universities: country.universities
        .filter(
          u =>
            u.full.toLowerCase().includes(q) ||
            u.name.toLowerCase().includes(q) ||
            country.name.toLowerCase().includes(q)
        )
        .sort((a, b) => a.name.localeCompare(b.name, "fr")),
    }))
    .filter(country => country.universities.length > 0);

  function select(full) {
    onChange(full);
    setQuery("");
    setOpen(false);
  }

  function clear() {
    onChange("");
    setQuery("");
  }

  return (
    <div ref={ref} className="relative">
      <div className="input flex items-center gap-2 cursor-text" onClick={() => { if (!disabled) setOpen(true); }}>
        {value && !open ? (
          <>
            <span className="flex-1 text-stone-800 text-sm truncate">
              {(() => {
                const meta = COUNTRIES.flatMap(c => c.universities).find(u => u.full === value);
                return meta ? dropdownLabel(meta) : value;
              })()}
            </span>
            {!disabled && (
              <button type="button" onClick={e => { e.stopPropagation(); clear(); }}
                className="text-stone-400 hover:text-stone-600 leading-none shrink-0">✕</button>
            )}
          </>
        ) : (
          <input
            type="text"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-stone-400"
            placeholder={value || placeholder || "Rechercher une université…"}
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            disabled={disabled}
          />
        )}
      </div>

      {open && !disabled && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-xl border border-stone-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-sm text-stone-400">Aucun résultat</p>
          ) : (
            filtered.map(country => (
              <div key={country.code}>
                <p className="px-3 pt-2 pb-0.5 text-[10px] font-semibold text-stone-400 uppercase tracking-wide">
                  {country.name}
                </p>
                {country.universities.map(u => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => select(u.full)}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-stone-50 transition-colors ${
                      value === u.full ? "text-accent font-medium" : "text-stone-700"
                    }`}
                  >
                    {dropdownLabel(u)}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
