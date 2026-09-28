import { shotImage } from "../../lib/siteShots.cjs";

// Une capture du site public (lib/siteShots.cjs) dans la langue de la page.
// `mobile` choisit une autre capture sous 640 px (téléphone au lieu
// d'ordinateur) : le navigateur ne télécharge que celle qui s'affiche.
// Les dimensions intrinsèques réservent la place avant le chargement.
export default function Shot({ lang, name, mobile, alt, sizes, mobileSizes, priority = false, className }) {
  const image = shotImage(lang, name);
  const phone = mobile ? shotImage(lang, mobile) : null;
  return (
    <picture className={className}>
      {phone && (
        <source media="(max-width: 639px)" srcSet={phone.srcSet} sizes={mobileSizes || sizes}
          width={phone.width} height={phone.height} />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.src}
        srcSet={image.srcSet}
        sizes={sizes}
        width={image.width}
        height={image.height}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchpriority={priority ? "high" : undefined}
      />
    </picture>
  );
}
