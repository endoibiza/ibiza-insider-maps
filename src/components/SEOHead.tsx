import { Helmet } from 'react-helmet-async';

interface SEOHeadProps {
  title: string;
  description: string;
  keywords?: string;
  canonicalPath?: string;
  ogImage?: string;
  robots?: string;
  structuredData?: object;
}

const SITE_URL = "https://ibiza-maps.com";
const SITE_NAME = "Ibiza Maps";
const DEFAULT_OG_IMAGE = `${SITE_URL}/ibiza-hero.jpg`;

const SEOHead = ({ 
  title, 
  description, 
  keywords = "Ibiza guide, Ibiza travel, Formentera, Ibiza beaches, Ibiza clubs, Ibiza restaurants, Ibiza insider tips",
  canonicalPath = "",
  ogImage = DEFAULT_OG_IMAGE,
  robots = "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
  structuredData
}: SEOHeadProps) => {
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
  const canonicalUrl = `${SITE_URL}${canonicalPath}`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      <link rel="canonical" href={canonicalUrl} />
      
      {/* Open Graph / Facebook */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:locale" content="en_US" />
      
      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      
      {/* Additional SEO */}
      <meta name="robots" content={robots} />
      <meta name="googlebot" content={robots.includes("noindex") ? "noindex, nofollow" : "index, follow"} />
      <meta name="language" content="English" />
      <meta name="revisit-after" content="7 days" />
      
      {/* Structured Data */}
      {structuredData && (
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      )}
    </Helmet>
  );
};

export default SEOHead;
