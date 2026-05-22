const MAX_IMAGE_SIDE = 1600;
const IMAGE_QUALITY = 0.82;
const SMALL_IMAGE_BYTES = 1.5 * 1024 * 1024;

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
