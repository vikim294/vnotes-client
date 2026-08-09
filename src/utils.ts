export const getImageNodeUrl = (imageUrl: string, isTempImageUrl?: boolean) => {
  return isTempImageUrl
    ? imageUrl
    : `${import.meta.env.VITE_IMAGE_BASE_URL}/${imageUrl}`;
};
