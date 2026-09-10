import Link from "next/link";
import Glyph from "./Glyph";
import { useI18n } from "../contexts/I18nContext";

// En-tête d'une sous-page.
//
// Les écrans nommés par la navigation n'affichent pas leur titre — l'onglet
// actif le dit déjà. Une sous-page, elle, n'est nommée nulle part : elle porte
// donc son titre ET le chemin du retour. Sans ce retour on ne sait plus d'où
// l'on vient, et sur téléphone la barre du bas ramène à l'onglet, pas à la
// page précédente.
export default function PageHeader({ backHref, backLabel, title, subtitle, right }) {
  const { t } = useI18n();
  return (
    <header className="mb-6">
      <Link href={backHref}
        className="bt-press -ml-1.5 mb-3 inline-flex min-h-9 items-center gap-1.5 rounded-full pl-1.5 pr-3 text-sm font-semibold transition-colors"
        style={{ color: "var(--bt-text-3)" }}>
        <Glyph size={17}><polyline points="15 18 9 12 15 6" /></Glyph>
        {backLabel || t("common.back")}
      </Link>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold leading-tight tracking-[-0.02em] sm:text-[1.75rem]"
            style={{ color: "var(--bt-text-1)" }}>
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm" style={{ color: "var(--bt-text-3)" }}>{subtitle}</p>
          )}
        </div>
        {right}
      </div>
    </header>
  );
}
