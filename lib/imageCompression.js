const MAX_IMAGE_SIDE = 800;
const IMAGE_QUALITY = 0.72;
const SMALL_IMAGE_BYTES = 500 * 1024;

const MAX_AVATAR_SIDE = 320;
const AVATAR_QUALITY = 0.75;
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

// Compression spécifique pour les avatars : max 320×320 px, WebP préféré.
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

  // 320 px suffit à un avatar et garantit une petite empreinte Storage,
  // même pour une photo iPhone très détaillée.
  for (const quality of [0.65, 0.55, 0.45]) {
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
