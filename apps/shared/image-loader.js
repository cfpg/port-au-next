const imageLoader = ({ src, width, quality }) => {
  // Handle both absolute and relative URLs
  const baseUrl = process.env.NEXT_PUBLIC_IMAGE_DOMAIN || '';
  const fullSrc = src.startsWith('http') ? src : `${baseUrl}/_next/image`;
  
  // Add version and other parameters
  const params = new URLSearchParams({
    url: src,
    v: process.env.NEXT_PUBLIC_DEPLOY_VERSION || '',
    w: width,
    q: quality || 75
  });

  return `${fullSrc}?${params.toString()}`;
};

module.exports = imageLoader; 