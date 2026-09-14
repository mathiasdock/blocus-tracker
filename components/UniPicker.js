import { Fragment, useEffect, useId, useRef, useState } from "react";
import Glyph from "./Glyph";
import { useI18n } from "../contexts/I18nContext";
import { COUNTRIES } from "../lib/universities";

function SearchIcon() {
  return (
    <Glyph size={18}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </Glyph>
  );
}

function CloseIcon() {
  return (
    <Glyph size={17}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Glyph>
  );
}

export default function UniPicker({
  id,
  value,
  onChange,
  disabled,
  placeholder,
  error = false,
  ariaDescribedBy,
}) {
  const { t, lang } = useI18n();
  const generatedId = useId().replace(/:/g, "");
  const inputId = id || `university-${generatedId}`;
  const listId = `${inputId}-listbox`;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [remote, setRemote] = useState([]);
  const [searching, setSearching] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    setRemote([]);
    if (!open || query.trim().length < 2) { setSearching(false); return undefined; }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/universities?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        if (!response.ok) throw new Error("search");
        const result = await response.json();
        if (!controller.signal.aborted) setRemote(result.universities || []);
      } catch { /* The curated list and explicit custom entry remain usable. */ }
      finally { if (!controller.signal.aborted) setSearching(false); }
    }, 280);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, open]);

  useEffect(() => {
    function handleOutsideClick(event) {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
        setQuery("");
        setActiveIndex(-1);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  function dropdownLabel(university) {
    if (university.full.toLowerCase().includes(university.name.toLowerCase())) return university.full;
    return `${university.name} - ${university.full}`;
  }

  const selectedMeta = COUNTRIES
    .flatMap(country => country.universities)
    .find(university => university.full === value);
  const selectedLabel = selectedMeta ? dropdownLabel(selectedMeta) : value;
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = COUNTRIES
    .map(country => ({
      ...country,
      universities: country.universities
        .filter(university => (
          university.full.toLowerCase().includes(normalizedQuery) ||
          university.name.toLowerCase().includes(normalizedQuery) ||
          country.name.toLowerCase().includes(normalizedQuery)
        ))
        .sort((a, b) => a.name.localeCompare(b.name, "fr")),
    }))
    .filter(country => country.universities.length > 0);
  const localOptions = filtered.flatMap(country => country.universities.map(university => ({
    ...university,
    countryCode: country.code,
    countryName: country.name,
  })));
  const options = [...localOptions, ...remote.filter(row => !localOptions.some(local => local.full === row.full))];
  if (query.trim().length >= 2 && !options.some(row => row.full.toLowerCase() === normalizedQuery)) {
    options.push({ id: "custom", full: query.trim().slice(0, 180), name: query.trim(), countryCode: "custom", countryName: lang === "fr" ? "Établissement non répertorié" : "Unlisted institution", custom: true });
  }

  function choose(university) {
    onChange(university.full);
    setQuery("");
    setOpen(false);
    setActiveIndex(-1);
  }

  function clear() {
    onChange("");
    setQuery("");
    setOpen(true);
    setActiveIndex(-1);
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
      setActiveIndex(-1);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(current => Math.min(current + 1, options.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(current => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter" && open && activeIndex >= 0 && options[activeIndex]) {
      event.preventDefault();
      choose(options[activeIndex]);
    }
  }

  return (
    <div ref={ref} className="relative">
      <div className={`input flex items-center gap-2 px-3 ${error ? "input-error" : "focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/10"}`}>
        <span className="shrink-0" style={{ color: "var(--bt-text-3)" }}><SearchIcon /></span>
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
          aria-invalid={error}
          aria-describedby={ariaDescribedBy}
          className="min-w-0 flex-1 bg-transparent py-0 outline-none !min-h-0"
          style={{ color: "var(--bt-text-1)" }}
          placeholder={placeholder || t("signup.uniSearch")}
          value={open ? query : (selectedLabel || query)}
          onChange={event => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => {
            setQuery("");
            setOpen(true);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          autoComplete="off"
          maxLength={180}
        />
        {value && !disabled && (
          <button
            type="button"
            onMouseDown={event => event.preventDefault()}
            onClick={clear}
            className="bt-tap inline-flex w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[var(--bt-subtle)]"
            style={{ color: "var(--bt-text-2)" }}
            aria-label={t("signup.clearUniversity")}
          >
            <CloseIcon />
          </button>
        )}
      </div>

      {open && !disabled && (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-2 max-h-64 overflow-y-auto rounded-xl border shadow-lg"
          style={{ backgroundColor: "var(--bt-surface)", borderColor: "var(--bt-border)" }}
        >
          {searching && <p role="status" className="px-4 py-2 text-xs" style={{ color: "var(--bt-text-2)" }}>{lang === "fr" ? "Recherche dans l’annuaire mondial…" : "Searching the worldwide directory…"}</p>}
          {options.length === 0 ? (
            <p className="px-4 py-3 text-sm" style={{ color: "var(--bt-text-2)" }}>{t("common.noResults")}</p>
          ) : (
            options.map((university, index) => {
              const showCountry = index === 0 || options[index - 1].countryCode !== university.countryCode;
              return (
                <Fragment key={university.id}>
                  {showCountry && (
                    <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--bt-text-2)" }}>
                      {university.countryName}
                    </p>
                  )}
                  <button
                    id={`${listId}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={value === university.full}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => choose(university)}
                    className="min-h-11 w-full px-4 py-2.5 text-left text-sm transition-colors"
                    style={{
                      backgroundColor: activeIndex === index ? "var(--bt-subtle)" : "transparent",
                      color: value === university.full ? "var(--bt-accent-text)" : "var(--bt-text-1)",
                      fontWeight: value === university.full ? 600 : 400,
                    }}
                  >
                    {university.custom ? `${lang === "fr" ? "Utiliser" : "Use"} « ${university.full} »` : dropdownLabel(university)}
                  </button>
                </Fragment>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
