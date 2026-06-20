import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  MapPinIcon, 
  StarIcon, 
  ShieldCheckIcon, 
  ClockIcon,
  UsersIcon,
  SparklesIcon,
  Crown,
  LogIn,
  LogOut,
  ExternalLink,
  Newspaper,
  CalendarDays
} from "lucide-react";
import { getCategories, parseMapData } from "@/data/maps-data";
import { useAuth } from "@/components/AuthProvider";
import PaywallModal from "@/components/PaywallModal";
import InteractiveMap from "@/components/InteractiveMap";
import SEOHead from "@/components/SEOHead";
import { ANALYTICS_EVENTS, track } from "@/lib/analytics";

import benirrasHero from "@/assets/benirras-beach.jpg";

type MapLink = {
  name: string;
  url?: string;
  icon?: string;
  description?: string;
  subtitle?: string;
  website?: string;
  category?: boolean;
};

const HomePage = () => {
  const categories = getCategories();
  const allLocations = parseMapData();
  const totalLocations = allLocations.length;
  const { user, hasPremiumAccess, signOut } = useAuth();
  const [showPaywall, setShowPaywall] = useState(false);

  const openPaywall = (location: string, featureName = "home page") => {
    track(ANALYTICS_EVENTS.paywallCtaClicked, {
      source: "home_page",
      location,
      feature_name: featureName,
    });
    setShowPaywall(true);
  };

  // Essential collections with direct links or category handling
  const essentialCollections = [
    { name: "Ibiza Favorites", url: "https://maps.app.goo.gl/9hHCBkNtHWbUUThK9", icon: "⭐", description: "The island shortlist worth starting with" },
    { name: "Ibiza Masterlist", url: "https://maps.app.goo.gl/BQVXZHt2oNRzQmNi6", icon: "📋", description: "The complete island map system" },
    { name: "Beaches", url: "https://maps.app.goo.gl/moHbkoBsMeRWyG7o6", icon: "🏖️", description: "Ibiza Beach Insider Complete Guide" },
    { name: "Clubs", url: "https://maps.app.goo.gl/QReFrGiEtf8vxojGA", icon: "🎉", description: "Superclubs, bars, and tonight's plan" },
    { name: "Restaurants", url: "https://maps.app.goo.gl/NKo8zMafHBkBHgvy7", icon: "🍽️", description: "Ibiza Restaurants Master List" },
    { name: "Explore Ibiza", url: "https://maps.app.goo.gl/LhnrauUunzPB83LcA", icon: "🌿", description: "Nature and outdoor adventures" },
    { name: "Ibiza Winter", url: "https://maps.app.goo.gl/7nUTwD76YJyWr3nJ6", icon: "❄️", description: "Places open during the winter season" },
    { name: "Hotels", url: "https://maps.app.goo.gl/CJoiWjxbbsdfUS9X7", icon: "🏨", description: "Boutique hotels to luxury agroturismos" },
    { name: "Shopping", url: "https://maps.app.goo.gl/quCLVxsYQ1AE9usP9", icon: "🛍️", description: "Markets to designer boutiques" }
  ];

  const formentera = [
    { name: "Formentera", url: "https://maps.app.goo.gl/vuibXdGFpatp4WcX9" },
    { name: "Formentera Favorites", url: "https://maps.app.goo.gl/1q4P8KLs8sYwMhFb8" },
    { name: "Formentera Beaches", url: "https://maps.app.goo.gl/zdNEhVzSr7TnMXSg9" },
    { name: "Formentera Hotels", url: "https://maps.app.goo.gl/8V9aQgzfqnRXFrm4A" },
    { name: "Formentera Exploring", url: "https://maps.app.goo.gl/8PBoAgDaLmsT7nWW6", subtitle: "beaches & outdoor fun" },
    { name: "Formentera Regions", url: "https://maps.app.goo.gl/2YZVfm2XsB9Qg8wc7" }
  ];

  const foodDelivery = [
    { name: "Green Ibiza", url: "https://maps.app.goo.gl/945R6CNMzTbWWxfP7", website: "greendeliveryibiza.com" },
    { name: "ZAS Comida en tu boca", url: "https://maps.app.goo.gl/945R6CNMzTbWWxfP7", website: "zascomidaentuboca.com" }
  ];

  const villages = [
    { name: "All Ibiza Villages", url: "https://maps.app.goo.gl/9avjnjRwerivfkx26" },
    { name: "Cala Llenya", url: "https://maps.app.goo.gl/L4t7Bv9Zso1yRD1w8" },
    { name: "Cala Llonga", url: "https://maps.app.goo.gl/wHM9sJjcS3b4pRDr8" },
    { name: "Cala Pada", url: "https://maps.app.goo.gl/WUcWCZgwpLgxtxiu5" },
    { name: "Cala Tarida", url: "https://maps.app.goo.gl/aSYaiGnGtVFXJ6db7" },
    { name: "Cala Vadella", url: "https://maps.app.goo.gl/3v9GePNoDRH3Z5qV7" },
    { name: "Cap Martinet", url: "https://maps.app.goo.gl/1Mde9qJs4qMLQS9u5" },
    { name: "Es Canar", url: "https://maps.app.goo.gl/u6ZhEEsqYF5rNANn7" },
    { name: "Es Cubells", url: "https://maps.app.goo.gl/QkKiYsUfrqfPEgp38" },
    { name: "Es Figueral", url: "https://maps.app.goo.gl/WA7CAdjgMipiQg646" },
    { name: "Ibiza North", url: "https://maps.app.goo.gl/P5rYJk8YqTw3HJXL6" },
    { name: "Ibiza South", url: "https://maps.app.goo.gl/K8hGKPj9Xqy2hZRz9" },
    { name: "Ibiza Town", url: "https://maps.app.goo.gl/PH9BaQKGbiZe78QG7" },
    { name: "Jesús", url: "https://maps.app.goo.gl/1xkJ9WrpBevmWobE7" },
    { name: "Marina Botafoc", url: "https://maps.app.goo.gl/kV6S7sfspLdJXJXC6" },
    { name: "Platja d'en Bossa", url: "https://maps.app.goo.gl/RLhRU4Qxry1z3h9t6" },
    { name: "Port d'es Torrent", url: "https://maps.app.goo.gl/DnR8mtuZz7aypx1i8" },
    { name: "Portinatx", url: "https://maps.app.goo.gl/C6yLs64jsDB2R5wz7" },
    { name: "Puig d'en Valls", url: "https://maps.app.goo.gl/tgwhSwQNy4LBmKGm8" },
    { name: "Roca Llisa", url: "https://maps.app.goo.gl/bGCgFbuDatyoG4uQ8" },
    { name: "S'Argamassa", url: "https://maps.app.goo.gl/nxCKLuSZyA3Wo8Qr8" },
    { name: "Sant Agustí des Vedrà", url: "https://maps.app.goo.gl/REdWxeZpv8xCVUFd6" },
    { name: "Sant Antoni de Portmany", url: "https://maps.app.goo.gl/XsmUd8a968yX6MkL9" },
    { name: "Sant Carles de Peralta", url: "https://maps.app.goo.gl/reJsNvRPACPuihHdA" },
    { name: "Sant Joan de Labritja", url: "https://maps.app.goo.gl/MHdePVpXjdCZjNfG7" },
    { name: "Sant Jordi de ses Salines", url: "https://maps.app.goo.gl/x15ZPtTwr6CTB2Lr8" },
    { name: "Sant Josep de sa Talaia", url: "https://maps.app.goo.gl/KaEMYWakcgybYAg89" },
    { name: "Sant Llorenç de Balàfia", url: "https://maps.app.goo.gl/duRB7VViL6NYMAt59" },
    { name: "Sant Mateu d'Albarca", url: "https://maps.app.goo.gl/yZGb3wJndbKeEqMJ7" },
    { name: "Sant Miguel de Balasant", url: "https://maps.app.goo.gl/erJgqxqsewuLkgUm8" },
    { name: "Sant Rafel de sa Creu", url: "https://maps.app.goo.gl/dFndX8y9RmadVKpo9" },
    { name: "Sant Vicent de sa Cala", url: "https://maps.app.goo.gl/NCF9RjDbsjp3TFwp7" },
    { name: "Santa Agnès de Corona", url: "https://maps.app.goo.gl/iUGEaPNzcuzRtzrw5" },
    { name: "Santa Eulària des Riu", url: "https://maps.app.goo.gl/tfiDDTRcmAaKXR18A" },
    { name: "Santa Gertrudis de Fruitera", url: "https://maps.app.goo.gl/XVYEzVSU4sfW6oPE6" },
    { name: "Ses Salines", url: "https://maps.app.goo.gl/S3e1n11VP8gd1LPL8" },
    { name: "Siesta", url: "https://maps.app.goo.gl/62gvbyQqfL6Txvr7A" },
    { name: "Talamanca", url: "https://maps.app.goo.gl/wZ4Y5FaXxUgr6LuU9" },
    { name: "Taxi Stands", url: "https://maps.app.goo.gl/Tusqz6LUWPp2RiFD8" },
    { name: "Valverde", url: "https://maps.app.goo.gl/63vcEpTn5GkbkR579" }
  ];

  const restaurantThemes = [
    { name: "Bars", url: "https://maps.app.goo.gl/hqKjb46Pqn4bFW6m9", icon: "🍹" },
    { name: "Breakfast", url: "https://maps.app.goo.gl/A6PHgs3Gzd44rHv57", icon: "🥐" },
    { name: "Burgers", url: "https://maps.app.goo.gl/oVmoEwdGFZNKrk6M6", icon: "🍔" },
    { name: "Country Restaurants", url: "https://maps.app.goo.gl/LGjYhaLvhys4UsAg8", icon: "🌾" },
    { name: "Date Spots", url: "https://maps.app.goo.gl/frZZZEaut7FjMCU39", icon: "💖" },
    { name: "Late Night", url: "https://maps.app.goo.gl/Zvc5YYH3t98Xto3z5", icon: "🌙" },
    { name: "Live Music", url: "https://maps.app.goo.gl/MgXWLpkLxXfffeUQ9", icon: "🎵" },
    { name: "Lunch by the Sea", url: "https://maps.app.goo.gl/EEU8nDrGY5M852gM9", icon: "🌊" },
    { name: "Pizza Places", url: "https://maps.app.goo.gl/pT7hENMmL9UTciv5A", icon: "🍕" },
    { name: "Romantic", url: "https://maps.app.goo.gl/LH2a4uzU6Mq29HLg9", icon: "💕" },
    { name: "Sunday Roast", url: "https://maps.app.goo.gl/tHwy8UZpBZjfK3tv5", icon: "🥩" },
    { name: "Sunset Dining", url: "https://maps.app.goo.gl/WrpMZv9MW5SBVfxz6", icon: "🌅" },
    { name: "Sushi", url: "https://maps.app.goo.gl/L2Ez9JkUKTvaTf4q7", icon: "🍣" },
    { name: "Vegetarian", url: "https://maps.app.goo.gl/6KYRk4165LaNWhG28", icon: "🥗" }
  ];

  const outdoorActivities = [
    { name: "Farms", url: "https://maps.app.goo.gl/VH339y9fCQUneRrx6", icon: "🚜" },
    { name: "Hiking", url: "https://maps.app.goo.gl/52yYeuKcM2FgAJMP6", icon: "🥾" }
  ];

  const otherCategories = [
    { name: "Gyms", url: "https://maps.app.goo.gl/Y5VLhdsbkE8cZa28A", icon: "💪" },
    { name: "Movie Theatres", url: "https://maps.app.goo.gl/pAXa4dkYbDWQm7u8A", icon: "🎭" },
    { name: "Services", icon: "🔧", category: true },
    { name: "Supermarkets", url: "https://maps.app.goo.gl/A3eFK7PQJpwPv37o9", icon: "🛒" },
    { name: "Transport", icon: "🚗", category: true }
  ];

  const features = [
    {
      icon: MapPinIcon,
      title: `1,500+ Island Places`,
      description: "Organized into 87+ practical Google Maps"
    },
    {
      icon: ShieldCheckIcon,
      title: "Built for Better Decisions",
      description: "Beaches, food, clubs, hotels, shopping, and local finds"
    },
    {
      icon: ClockIcon,
      title: "Plan Before You Land",
      description: "Arrive with the island already organized"
    },
    {
      icon: UsersIcon,
      title: "Useful While You Are Here",
      description: "Find better options when plans change"
    }
  ];

  const MapCard = ({ name, url, icon, description, subtitle, website }: MapLink) => (
    <Card className="group hover:shadow-xl hover:scale-[1.02] transition-all duration-300 border border-border/50 bg-card hover:border-primary/30">
      <CardContent className="p-6">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="text-4xl">{icon}</div>
          <div>
            <h4 className="font-semibold text-base mb-1 group-hover:text-primary transition-colors">
              {name}
            </h4>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
            {website && (
              <p className="text-xs text-muted-foreground mt-1">{website}</p>
            )}
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
            onClick={() => {
              if (!hasPremiumAccess) {
                track(ANALYTICS_EVENTS.mapPreviewClicked, {
                  source: "home_page",
                  location: "map_card",
                  feature_name: name,
                });
                openPaywall("map_card", name);
              } else if (url) {
                track(ANALYTICS_EVENTS.mapOpened, {
                  source: "home_page",
                  location: "map_card",
                  feature_name: name,
                });
                window.open(url, '_blank');
              }
            }}
          >
            {hasPremiumAccess ? (
              <>
                Explore
                <ExternalLink className="w-3 h-3 ml-2" />
              </>
            ) : (
              <>
                <Crown className="w-3 h-3 mr-2" />
                Preview
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const CompactMapButton = ({ name, url }: Pick<MapLink, "name" | "url">) => (
    <Button
      variant="outline"
      size="sm"
      className="h-auto py-3 px-4 text-sm hover:bg-primary hover:text-primary-foreground transition-all duration-300 border-border/50"
      onClick={() => {
        if (!hasPremiumAccess) {
          track(ANALYTICS_EVENTS.mapPreviewClicked, {
            source: "home_page",
            location: "compact_map_button",
            feature_name: name,
          });
          openPaywall("compact_map_button", name);
        } else {
          track(ANALYTICS_EVENTS.mapOpened, {
            source: "home_page",
            location: "compact_map_button",
            feature_name: name,
          });
          window.open(url, '_blank');
        }
      }}
    >
      <span className="truncate">{name}</span>
    </Button>
  );

  return (
    <>
      <SEOHead 
        title="Ibiza Maps - The Definitive Insider Map for Ibiza"
        description="Beaches, restaurants, clubs, hotels, shopping, events, and hidden spots organized into 87+ curated Google Maps with 1,500+ Ibiza places."
        keywords="Ibiza maps, Ibiza travel, Ibiza beaches, Ibiza clubs, Ibiza restaurants, Google Maps Ibiza, insider map Ibiza"
        canonicalPath="/"
      />
      <div className="min-h-screen bg-background">
      {/* User Auth Bar */}
      <div className="border-b border-border/40 bg-background/95 backdrop-blur-md sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 lg:px-6 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <h1 className="text-xl font-bold bg-gradient-hero bg-clip-text text-transparent">
              Ibiza Maps
            </h1>
          </Link>
          <div className="flex items-center gap-3">
            {user ? (
              <>
                {hasPremiumAccess && (
                  <Badge variant="secondary" className="bg-primary/10 text-primary border border-primary/20 hidden sm:flex">
                    <Crown className="w-3 h-3 mr-1" />
                    Premium
                  </Badge>
                )}
                <span className="text-sm text-muted-foreground hidden md:inline">{user.email}</span>
                <Button variant="ghost" size="sm" onClick={signOut}>
                  <LogOut className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Sign Out</span>
                </Button>
              </>
            ) : (
              <Button variant="default" size="sm" onClick={() => {
                track(ANALYTICS_EVENTS.paywallCtaClicked, {
                  source: "home_page",
                  location: "header_sign_in",
                  feature_name: "auth",
                });
                window.location.href = '/auth';
              }}>
                <LogIn className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Sign In</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <section className="relative min-h-[85vh] flex items-center justify-center overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${benirrasHero})` }}
        >
          <div className="absolute inset-0 bg-gradient-overlay" />
        </div>
        
        <div className="relative z-10 container-safe text-center max-w-5xl py-20">
          {hasPremiumAccess && (
            <Badge className="mb-6 bg-white/10 backdrop-blur-sm text-white border-white/20 shadow-xl">
              <SparklesIcon className="w-4 h-4 mr-2" />
              Premium Access Active
            </Badge>
          )}
          
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight text-white drop-shadow-2xl">
            {hasPremiumAccess ? (
              <>Welcome Back to Your <span className="text-accent">Ibiza Maps</span></>
            ) : (
              <>The Definitive <span className="text-accent">Insider Map</span><br />for Ibiza</>
            )}
          </h1>
          
          <p className="text-lg md:text-xl text-white/95 mb-10 max-w-3xl mx-auto leading-relaxed drop-shadow-lg">
            {hasPremiumAccess ? (
              "Open your curated maps, find the right places faster, and keep the island close while you are here."
            ) : (
              "Beaches, restaurants, clubs, hotels, shopping, events, and hidden spots - organized into 87+ curated Google Maps with 1,500+ places."
            )}
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-10">
            {hasPremiumAccess ? (
              <Button 
                size="lg" 
                className="bg-white text-primary hover:bg-white/90 shadow-xl px-8"
                onClick={() => {
                  document.getElementById('collections')?.scrollIntoView({ behavior: 'smooth' });
                  track(ANALYTICS_EVENTS.externalLinkClicked, {
                    source: "home_page",
                    location: "hero_browse_collections",
                  });
                }}
              >
                <MapPinIcon className="w-5 h-5 mr-2" />
                Browse Collections
              </Button>
            ) : (
              <>
                <Button
                  size="lg"
                  className="bg-white text-primary hover:bg-white/90 shadow-xl px-8"
                  onClick={() => {
                    document.getElementById('collections')?.scrollIntoView({ behavior: 'smooth' });
                    track(ANALYTICS_EVENTS.externalLinkClicked, {
                      source: "home_page",
                      location: "hero_preview_maps",
                    });
                  }}
                >
                  <MapPinIcon className="w-5 h-5 mr-2" />
                  Preview the Maps
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/70 bg-white/10 text-white hover:bg-white hover:text-primary shadow-xl px-8"
                  onClick={() => openPaywall("hero_get_lifetime_access")}
                >
                  Get Lifetime Access - €29.99
                </Button>
              </>
            )}
          </div>
          
          {!hasPremiumAccess && (
            <>
              <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-white/85">
                <div className="flex items-center gap-2">
                  <StarIcon className="w-4 h-4 fill-accent text-accent" />
                  87+ Curated Maps
                </div>
                <div className="flex items-center gap-2">
                  <ShieldCheckIcon className="w-4 h-4 text-accent" />
                  1,500+ Places
                </div>
                <div className="flex items-center gap-2">
                  <UsersIcon className="w-4 h-4 text-accent" />
                  One-Time Payment
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Events Section */}
      <section className="py-16 md:py-20 bg-gradient-section">
        <div className="container-safe">
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold mb-4">Ibiza Events</h2>
            <p className="text-muted-foreground mb-6">
              Stay updated with the latest club nights, festivals, and local events happening across the island.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg" className="bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 shadow-lg">
                <Link to="/events">
                  <CalendarDays className="w-5 h-5 mr-2 inline" />
                  Ibiza Events
                </Link>
              </Button>
              <Button asChild size="lg" className="bg-gradient-accent text-accent-foreground hover:opacity-90 shadow-lg">
                <Link to="/map">
                  Island Maps
                </Link>
              </Button>
              <Button asChild size="lg" className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:from-blue-600 hover:to-cyan-600 shadow-lg">
                <Link to="/weather">
                  Ibiza Weather
                </Link>
              </Button>
              <Button asChild size="lg" className="bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600 shadow-lg">
                <Link to="/news">
                  <Newspaper className="w-5 h-5 mr-2 inline" />
                  Ibiza News
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section - Only for non-premium */}
      {!hasPremiumAccess && (
        <section className="py-16 md:py-20">
          <div className="container-safe">
            <div className="text-center mb-16 max-w-3xl mx-auto">
              <h2 className="text-4xl font-bold mb-4">Why Ibiza Maps?</h2>
              <p className="text-xl text-muted-foreground">
                More useful than another travel guide: a practical map system for deciding where to swim, eat, go out, stay, shop, and explore.
              </p>
            </div>
            
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {features.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <div key={index} className="text-center">
                    <div className="w-16 h-16 bg-gradient-hero rounded-2xl mx-auto mb-5 flex items-center justify-center shadow-lg">
                      <Icon className="w-8 h-8 text-primary-foreground" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Main Collections Section */}
      <section id="collections" className="py-16 md:py-20 bg-gradient-section">
        <div className="container-safe">
          {/* Essential Collections */}
          <div className="mb-20">
            <div className="text-center mb-12 max-w-3xl mx-auto">
              <h2 className="text-4xl font-bold mb-4">Essential Collections</h2>
              <p className="text-xl text-muted-foreground">
                Your most important Ibiza resources - from first picks to local finds
              </p>
            </div>
            
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {essentialCollections.map((collection) => (
                <MapCard key={collection.name} {...collection} />
              ))}
            </div>
          </div>

          {/* Formentera Section */}
          <div className="mb-20">
            <div className="text-center mb-10">
              <h3 className="text-3xl font-bold mb-3">Formentera</h3>
              <p className="text-muted-foreground">Discover the neighboring paradise island</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {formentera.map((item) => (
                <MapCard key={item.name} {...item} icon="🏝️" />
              ))}
            </div>
          </div>

          {/* Restaurant Themes */}
          <div className="mb-20">
            <div className="text-center mb-10">
              <h3 className="text-3xl font-bold mb-3">Restaurant Themes</h3>
              <p className="text-muted-foreground">Find the perfect dining experience for any occasion</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {restaurantThemes.map((theme) => (
                <MapCard key={theme.name} {...theme} />
              ))}
            </div>
          </div>

          {/* Villages & Areas */}
          <div className="mb-20">
            <div className="text-center mb-10">
              <h3 className="text-3xl font-bold mb-3">Villages & Areas</h3>
              <p className="text-muted-foreground">Explore Ibiza's charming villages and neighborhoods</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {villages.map((village) => (
                <CompactMapButton key={village.name} {...village} />
              ))}
            </div>
          </div>

          {/* Nature & Outdoors */}
          <div className="mb-20">
            <div className="text-center mb-10">
              <h3 className="text-3xl font-bold mb-3">Nature & Outdoors</h3>
              <p className="text-muted-foreground">Experience Ibiza's natural beauty</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-5 max-w-2xl mx-auto">
              {outdoorActivities.map((item) => (
                <MapCard key={item.name} {...item} />
              ))}
            </div>
          </div>

          {/* Food Delivery */}
          <div className="mb-20">
            <div className="text-center mb-10">
              <h3 className="text-3xl font-bold mb-3">Food Delivery</h3>
              <p className="text-muted-foreground">Top delivery services on the island</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-5 max-w-2xl mx-auto">
              {foodDelivery.map((item) => (
                <MapCard key={item.name} {...item} icon="🚚" website={item.website} />
              ))}
            </div>
          </div>

          {/* Other Categories */}
          <div className="mb-12">
            <div className="text-center mb-10">
              <h3 className="text-3xl font-bold mb-3">More Categories</h3>
              <p className="text-muted-foreground">Additional essential services and locations</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {otherCategories.map((category) => (
                <MapCard key={category.name} {...category} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section - Only for non-premium */}
      {!hasPremiumAccess && (
        <section className="py-16 md:py-20 bg-gradient-hero text-primary-foreground">
          <div className="container-safe text-center">
            <h2 className="text-4xl font-bold mb-4">
              Ibiza Is Easier When the Island Is Already Mapped
            </h2>
            <p className="text-xl mb-10 opacity-90 max-w-2xl mx-auto">
              Get lifetime access to 87+ curated Google Maps and {totalLocations}+ Ibiza places for one payment.
            </p>
            
            <Button 
              size="lg" 
              variant="secondary" 
              className="shadow-xl px-8"
              onClick={() => openPaywall("bottom_cta")}
            >
              Get Lifetime Access - €29.99
            </Button>
          </div>
        </section>
      )}

      <PaywallModal 
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
      />
      </div>
    </>
  );
};

export default HomePage;
