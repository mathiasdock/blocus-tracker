// Icône d'interface — la primitive partagée.
//
// L'app dessinait ses icônes en SVG inline, une par une, chacune avec sa
// propre épaisseur de trait : quatorze valeurs différentes en circulation, de
// 1,6 à 6. Côte à côte dans une même rangée, ça se voit comme des polices
// mélangées. Trois écrans (profil, fil, messagerie) avaient fini par se
// recopier chacun leur petit composant local — trois copies qui allaient
// diverger.
//
// ── L'épaisseur suit la taille, mais pas proportionnellement ──
// Une épaisseur FIXE sur une grille 24 donne un trait qui rétrécit avec
// l'icône : à 10 px, il tombe sous le pixel et devient flou. Une épaisseur
// OPTIQUE constante fait l'inverse — à 10 px, le trait mange un sixième du
// dessin et tout se referme en pâté.
//
// La vérité est entre les deux : plus l'icône est petite, plus son trait est
// LÉGÈREMENT plus fin en valeur optique, parce qu'un petit dessin est aussi
// un dessin plus simple. Quatre marches suffisent ; une formule continue
// donnerait des valeurs à trois décimales que personne ne saurait relire.
//
//   ≥ 20 px → 1,8   (≈ 1,65 px rendus)
//   16-19   → 2     (≈ 1,50)
//   13-15   → 2,3   (≈ 1,34)
//   ≤ 12    → 2,6   (≈ 1,30)
//
// ── Usage ───────────────────────────────────────────────────
//   <Glyph size={22}><path d="…" /></Glyph>
// La couleur vient de `currentColor` : c'est le parent qui la décide, jamais
// l'icône. Et `aria-hidden` est le défaut — une icône double presque toujours
// un libellé ; quand elle est seule, c'est au bouton de porter l'aria-label.

export function strokeForSize(size) {
  if (size >= 20) return 1.8;
  if (size >= 16) return 2;
  if (size >= 13) return 2.3;
  return 2.6;
}

export default function Glyph({
  size = 18,
  strokeWidth,
  className,
  style,
  title,
  children,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth ?? strokeForSize(size)}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      // Une icône seule dans un bouton doit être nommée par le BOUTON
      // (aria-label), pas par elle-même : sinon le lecteur d'écran annonce
      // deux fois la même chose, ou pire, annonce l'icône et pas l'action.
      aria-hidden={title ? undefined : "true"}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}
