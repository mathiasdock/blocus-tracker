// Photos du feed, des messages, des groupes et des salons : 1280 px sur le
// grand côté suffisent à l'affichage le plus large de l'app (colonne de
// 640 px sur un écran ×2) et restent nets sur un téléphone ×3. Qualité 0,8 :
// sans perte visible, ~150–400 Ko pour une photo de téléphone de 3 à 6 Mo.
// La réencoder retire aussi ses métadonnées (dont la position GPS).
export const MAX_IMAGE_SIDE = 1280;
export const IMAGE_QUALITY = 0.8;
// Une image déjà petite (dimensions ET poids) part telle quelle.
const SMALL_IMAGE_BYTES = 300 * 1024;

// Avatars : affichés au plus ~120 px (×3 = 360 px) → 512 px, ~30–80 Ko.
export const MAX_AVATAR_SIDE = 512;
const AVATAR_QUALITY = 0.8;
const MAX_AVATAR_BYTES = 400 * 1024;

function extensionForType(type) {
  if (type === "image/webp") return "webp";
  if (type === "image/png") return "png";
  return "jpg";
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image loading failed"));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

function isHeicFile(file) {
  const type = String(file?.type || "").toLowerCase();
  const name = String(file?.name || "").toLowerCase();
  return type === "image/heic" || type === "image/heif" || /\.(heic|heif)$/.test(name);
}

async function convertHeicToJpeg(file) {
  const { heicTo } = await import("heic-to/csp");
  const blob = await heicTo({ blob: file, type: "image/jpeg", quality: 0.9 });
  if (!(blob instanceof Blob) || !blob.size) throw new Error("HEIC conversion failed");
  return new File([blob], file.name.replace(/\.(heic|heif)$/i, ".jpg"), {
    type: "image/jpeg",
    lastModified: file.lastModified || Date.now(),
  });
}

export async function optimizeFeedImage(file) {
  if (!file || !file.type?.startsWith("image/")) {
    return { file, extension: file?.name?.split(".").pop() || "jpg", optimized: false };
  }

  const image = await loadImage(file);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) {
    return { file, extension: file.name.split(".").pop() || "jpg", optimized: false };
  }

  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  if (scale === 1 && file.size <= SMALL_IMAGE_BYTES) {
    return { file, extension: file.name.split(".").pop() || "jpg", optimized: false };
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return { file, extension: file.name.split(".").pop() || "jpg", optimized: false };
  }

  ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

  const preferredType = "image/webp";
  let blob = await canvasToBlob(canvas, preferredType, IMAGE_QUALITY);
  let outputType = blob?.type === preferredType ? preferredType : "image/jpeg";

  if (!blob || blob.type !== preferredType) {
    blob = await canvasToBlob(canvas, outputType, IMAGE_QUALITY);
  }

  if (!blob || blob.size >= file.size) {
    return { file, extension: file.name.split(".").pop() || "jpg", optimized: false };
  }

  const optimizedFile = new File([blob], file.name.replace(/\.[^.]+$/, `.${extensionForType(outputType)}`), {
    type: outputType,
    lastModified: Date.now(),
  });

  return {
    file: optimizedFile,
    extension: extensionForType(outputType),
    optimized: true,
    originalSize: file.size,
    optimizedSize: optimizedFile.size,
    width: targetWidth,
    height: targetHeight,
  };
}

// Compression spécifique pour les avatars : max 512×512 px, WebP préféré.
// HEIC/HEIF est converti dans le navigateur avant le redimensionnement.
export async function optimizeAvatarImage(file) {
  if (!file) throw new Error("Missing avatar file");

  const heicSource = isHeicFile(file);
  const browserFile = heicSource ? await convertHeicToJpeg(file) : file;
  const image = await loadImage(browserFile);

  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error("Invalid avatar dimensions");

  const scale = Math.min(1, MAX_AVATAR_SIDE / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  // Déjà assez petit → on envoie tel quel
  if (!heicSource && scale === 1 && file.size <= 200 * 1024) {
    return { file, extension: file.name.split(".").pop() || "jpg", optimized: false };
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");

  ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

  let outputType = "image/webp";
  let blob = await canvasToBlob(canvas, outputType, AVATAR_QUALITY);
  if (!blob || blob.type !== outputType) {
    outputType = "image/jpeg";
    blob = await canvasToBlob(canvas, outputType, AVATAR_QUALITY);
  }
  if (!blob) throw new Error("Avatar encoding failed");

  // 512 px suffisent à un avatar et garantissent une petite empreinte
  // Storage, même pour une photo iPhone très détaillée.
  for (const quality of [0.7, 0.6, 0.5]) {
    if (blob.size <= MAX_AVATAR_BYTES) break;
    blob = await canvasToBlob(canvas, outputType, quality);
    if (!blob) throw new Error("Avatar encoding failed");
  }
  if (blob.size > MAX_AVATAR_BYTES) throw new Error("Avatar remains too large");

  const ext = extensionForType(outputType);
  const optimizedFile = new File(
    [blob],
    file.name.replace(/\.[^.]+$/, `.${ext}`),
    { type: outputType, lastModified: Date.now() }
  );

  return {
    file: optimizedFile,
    extension: ext,
    optimized: true,
    originalSize: file.size,
    optimizedSize: optimizedFile.size,
    width: targetWidth,
    height: targetHeight,
  };
}
