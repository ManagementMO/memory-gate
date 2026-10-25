/** A small, re-encoded family photo fits a Convex action and removes embedded location metadata. */
export async function prepareFamilyPhoto(file: File): Promise<ArrayBuffer> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5_000_000) throw new Error('Choose a JPEG, PNG or WebP photo smaller than 5 MB.');
  const url = URL.createObjectURL(file), image = new Image();
  try {
    image.src = url; await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('This photo could not be opened.');
    const canvas = document.createElement('canvas'), context = canvas.getContext('2d'); if (!context) throw new Error('Photo preparation is unavailable in this browser.');
    for (const edge of [1600, 1280, 1024]) {
      const scale = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
      context.fillStyle = '#f4eedf'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .8));
      if (blob && blob.size <= 600_000) return blob.arrayBuffer();
    }
    throw new Error('Try a smaller photo.');
  } finally { image.src = ''; URL.revokeObjectURL(url); }
}
