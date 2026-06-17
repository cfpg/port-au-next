import Script from "next/script";

export function UmamiAnalytics() {
  const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  const host = process.env.NEXT_PUBLIC_UMAMI_HOST;
  if (!websiteId || !host) return null;

  return (
    <Script
      src={`${host}/script.js`}
      data-website-id={websiteId}
      strategy="afterInteractive"
    />
  );
}
