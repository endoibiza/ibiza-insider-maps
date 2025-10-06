import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Newspaper, TrendingUp, MapPin, Calendar } from 'lucide-react';
import NewsWidget from '@/components/NewsWidget';
import SEOHead from '@/components/SEOHead';
import { NewsSkeleton } from '@/components/ui/skeleton-loaders';
import esVedraHero from '@/assets/es-vedra-real.jpg';

const NewsPage = () => {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "NewsMediaOrganization",
    "name": "Ibiza Insider News",
    "description": "Daily news aggregator for Ibiza from multiple trusted local sources",
    "url": "https://ibiza-insider.lovable.app/news",
    "areaServed": "Ibiza, Balearic Islands, Spain"
  };

  return (
    <>
      <SEOHead 
        title="Ibiza News Today - Daily Updates from Diario & Spotlight"
        description="Latest Ibiza news from Diario de Ibiza, Periódico de Ibiza, Ibiza Spotlight. Breaking local stories, events, policies & community updates."
        keywords="Ibiza news, Diario de Ibiza, Ibiza Spotlight, Ibiza today, local news, island updates"
        canonicalPath="/news"
        structuredData={structuredData}
      />
      <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/40 bg-background/95 backdrop-blur-md sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 lg:px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Link>
          </Button>
          <h1 className="text-xl font-bold bg-gradient-hero bg-clip-text text-transparent">
            Ibiza News
          </h1>
        </div>
      </div>

      {/* Hero Section with News Theme */}
      <section className="relative py-16 md:py-20 overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-20"
          style={{ backgroundImage: `url(${esVedraHero})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-background via-background/80 to-background" />
        </div>
        
        <div className="relative z-10 container mx-auto px-4 lg:px-6 text-center max-w-4xl">
          <div className="flex justify-center mb-6">
            <div className="bg-gradient-to-br from-orange-500 to-red-500 p-4 rounded-2xl shadow-xl">
              <Newspaper className="w-16 h-16 text-white" />
            </div>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
            Ibiza Daily News
          </h1>
          
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Stay informed with today's latest news from Diario de Ibiza, Periódico de Ibiza, Ibiza Spotlight, and other trusted local sources
          </p>

          {/* News Info Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl p-4">
              <TrendingUp className="w-6 h-6 text-primary mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Top Stories</p>
            </div>
            <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl p-4">
              <MapPin className="w-6 h-6 text-primary mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Local Updates</p>
            </div>
            <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl p-4">
              <Calendar className="w-6 h-6 text-primary mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Events & Culture</p>
            </div>
            <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl p-4">
              <Newspaper className="w-6 h-6 text-primary mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Multi-Source</p>
            </div>
          </div>
        </div>
      </section>

      {/* News Data Section */}
      <section className="pb-16 md:pb-20">
        <div className="container mx-auto px-4 lg:px-6">
          <div className="max-w-5xl mx-auto">
            <React.Suspense fallback={<NewsSkeleton />}>
              <NewsWidget autoLoad={true} />
            </React.Suspense>
          </div>
        </div>
      </section>
      </div>
    </>
  );
};

export default NewsPage;
