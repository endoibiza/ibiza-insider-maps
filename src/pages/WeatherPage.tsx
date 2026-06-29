import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CloudSun, Wind, Droplets, Waves, AlertTriangle } from 'lucide-react';
import WeatherWidget from '@/components/WeatherWidget';
import SEOHead from '@/components/SEOHead';
import { WeatherSkeleton } from '@/components/ui/skeleton-loaders';
import esVedraHero from '@/assets/es-vedra-real.jpg';

const WeatherPage = () => {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "Ibiza Weather Forecast",
    "description": "Source-backed Ibiza weather, sea state, official alerts, sunrise and sunset, and beach-condition guidance.",
    "url": "https://ibiza-maps.com/weather",
    "about": {
      "@type": "Place",
      "name": "Ibiza, Balearic Islands, Spain"
    }
  };

  return (
    <>
      <SEOHead 
        title="Ibiza Weather Analyst - AEMET Alerts, Sea Conditions & Beach Picks"
        description="Cloud-refreshed Ibiza weather intelligence with official AEMET alert status, wind, sea state, UV, sunrise and sunset, source confidence, and beach recommendations."
        keywords="Ibiza weather, Ibiza forecast, AEMET Ibiza, beach recommendations, wind forecast, wave report, Ibiza sea conditions"
        canonicalPath="/weather"
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
            Ibiza Weather
          </h1>
        </div>
      </div>

      {/* Hero Section with Weather Theme */}
      <section className="relative overflow-hidden py-12 md:py-14">
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-20"
          style={{ backgroundImage: `url(${esVedraHero})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-background via-background/80 to-background" />
        </div>
        
        <div className="relative z-10 container mx-auto px-4 lg:px-6 text-center max-w-4xl">
          <div className="flex justify-center mb-6">
            <div className="bg-gradient-to-br from-blue-500 to-cyan-500 p-4 rounded-2xl shadow-xl">
              <CloudSun className="w-16 h-16 text-white" />
            </div>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
            Ibiza Weather Analyst
          </h1>
          
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Source-backed weather, official AEMET alert status, sea state, wind, UV, and ranked beach guidance
            with visible timestamps.
          </p>

          {/* Weather Info Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl p-4">
              <Wind className="w-6 h-6 text-primary mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Wind Conditions</p>
            </div>
            <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl p-4">
              <Droplets className="w-6 h-6 text-primary mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Precipitation</p>
            </div>
            <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl p-4">
              <Waves className="w-6 h-6 text-primary mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Sea Conditions</p>
            </div>
            <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl p-4">
              <AlertTriangle className="w-6 h-6 text-primary mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Official Alerts</p>
            </div>
          </div>
        </div>
      </section>

      {/* Weather Data Section */}
      <section className="pb-20">
        <div className="container mx-auto px-4 lg:px-6">
          <div className="max-w-5xl mx-auto">
            <React.Suspense fallback={<WeatherSkeleton />}>
              <WeatherWidget autoLoad={true} />
            </React.Suspense>
          </div>
        </div>
      </section>
      </div>
    </>
  );
};

export default WeatherPage;
