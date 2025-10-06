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
    "description": "Real-time weather conditions and forecasts for Ibiza from multiple meteorological sources",
    "url": "https://ibiza-insider.lovable.app/weather",
    "about": {
      "@type": "Place",
      "name": "Ibiza, Balearic Islands, Spain"
    }
  };

  return (
    <>
      <SEOHead 
        title="Ibiza Weather Forecast - Real-Time Conditions & Forecasts"
        description="Current Ibiza weather from AEMET, AccuWeather, Windy & ECMWF. Island-wide forecasts, wind, waves, jellyfish alerts & beach conditions."
        keywords="Ibiza weather, Ibiza forecast, AEMET Ibiza, beach conditions, wind forecast, wave report"
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
      <section className="relative py-16 overflow-hidden">
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
            Ibiza Weather Report
          </h1>
          
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Real-time weather data aggregated from multiple trusted sources including AEMET, AccuWeather, Windy, ECMWF, and more
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
              <p className="text-sm text-muted-foreground">Weather Alerts</p>
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
