export const getImageNodeUrl = (imageUrl: string, isTempImageUrl?: boolean) => {
  if (isTempImageUrl) return imageUrl;

  const baseUrl = String(import.meta.env.VITE_IMAGE_BASE_URL ?? '').replace(/\/$/, '');
  const path = imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`;
  return `${baseUrl}${path}`;
};
