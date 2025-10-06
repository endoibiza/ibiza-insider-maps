import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { parseMapData, getCategories, type MapLocation } from '@/data/maps-data';
import { useAuth } from '@/components/AuthProvider';
import PaywallModal from '@/components/PaywallModal';
import { 
  Search, 
  MapPin, 
  ExternalLink, 
  Filter,
  Crown,
  Globe
} from 'lucide-react';

const InteractiveMap = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showPaywall, setShowPaywall] = useState(false);
  const { hasPremiumAccess } = useAuth();
  
  const allLocations = parseMapData();
  const categories = ['All', ...getCategories()];
  
  // Show only preview content for non-premium users, full content for premium users
  const displayLocations = useMemo(() => {
    if (!hasPremiumAccess) {
      // Show only first 6 locations as preview
      return allLocations.slice(0, 6);
    }
    
    let filtered = allLocations;
    
    if (selectedCategory !== 'All') {
      filtered = filtered.filter(location => location.category === selectedCategory);
    }
    
    if (searchTerm) {
      filtered = filtered.filter(location =>
        location.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        location.category.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    return filtered;
  }, [allLocations, selectedCategory, searchTerm, hasPremiumAccess]);

  const handleLocationClick = (url: string) => {
    if (!hasPremiumAccess) {
      setShowPaywall(true);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleFilterChange = (category: string) => {
    if (!hasPremiumAccess) {
      setShowPaywall(true);
      return;
    }
    setSelectedCategory(category);
  };

  const handleSearchChange = (value: string) => {
    if (!hasPremiumAccess) {
      setShowPaywall(true);
      return;
    }
    setSearchTerm(value);
  };

  return (
    <div className="w-full">
      {/* Map Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-gradient-to-br from-primary to-primary/70 rounded-lg flex items-center justify-center">
            <Globe className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Interactive Ibiza Map</h2>
            <p className="text-muted-foreground">
              {hasPremiumAccess 
                ? `Explore all ${allLocations.length} curated locations with full access`
                : `Preview: 6 of ${allLocations.length} premium locations`
              }
            </p>
          </div>
          <div className="flex gap-2 ml-auto">
            <Button asChild variant="outline" size="sm">
              <a 
                href="https://www.ibiza-spotlight.com/night/events" 
                target="_blank" 
                rel="noopener noreferrer"
              >
                📅 Events
              </a>
            </Button>
            {!hasPremiumAccess && (
              <Button 
                onClick={() => setShowPaywall(true)}
                size="sm"
              >
                <Crown className="w-4 h-4 mr-2" />
                Unlock All
              </Button>
            )}
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder={hasPremiumAccess ? "Search locations..." : "🔒 Unlock to search"}
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10"
              disabled={!hasPremiumAccess}
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Categories:</span>
          </div>
        </div>

        {/* Category Pills */}
        <div className="mt-4 flex flex-wrap gap-2">
          {categories.slice(0, 8).map((category) => (
            <Button
              key={category}
              variant={selectedCategory === category ? "default" : "outline"}
              size="sm"
              onClick={() => handleFilterChange(category)}
              className="text-xs"
              disabled={!hasPremiumAccess && category !== 'All'}
            >
              {category}
              {!hasPremiumAccess && category !== 'All' && (
                <Crown className="w-3 h-3 ml-1" />
              )}
            </Button>
          ))}
          {!hasPremiumAccess && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPaywall(true)}
              className="text-xs border-dashed border-primary text-primary"
            >
              <Crown className="w-3 h-3 mr-1" />
              +{categories.length - 8} more
            </Button>
          )}
        </div>
      </div>

      {/* Virtual Map Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {displayLocations.map((location) => (
          <Card
            key={location.id}
            className={`group transition-all duration-300 cursor-pointer ${
              hasPremiumAccess 
                ? 'hover:shadow-medium hover:scale-[1.02]' 
                : 'opacity-90'
            }`}
            onClick={() => handleLocationClick(location.url)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-base leading-tight group-hover:text-primary transition-colors line-clamp-2">
                    {location.name}
                  </CardTitle>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  {hasPremiumAccess ? (
                    <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                  ) : (
                    <Crown className="w-4 h-4 text-primary flex-shrink-0" />
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="text-xs">
                  {location.category}
                </Badge>
                <MapPin className="w-3 h-3 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Premium Upsell */}
      {!hasPremiumAccess && (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
          <CardContent className="p-6 text-center">
            <Crown className="w-12 h-12 text-primary mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">
              Unlock {allLocations.length - 6} More Locations
            </h3>
            <p className="text-muted-foreground mb-4">
              Get complete access to all curated Ibiza spots, interactive filters, 
              and Google Maps integration for just €29.99 (one-time payment).
            </p>
            <Button 
              onClick={() => setShowPaywall(true)}
              size="lg"
              className="w-full max-w-sm"
            >
              <Crown className="w-4 h-4 mr-2" />
              Get Premium Access
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Results Count */}
      {hasPremiumAccess && (
        <div className="mt-6 text-center text-sm text-muted-foreground">
          Showing {displayLocations.length} of {allLocations.length} locations
          {selectedCategory !== 'All' && ` in ${selectedCategory}`}
          {searchTerm && ` matching "${searchTerm}"`}
        </div>
      )}

      <PaywallModal 
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        featureName="interactive map"
      />
    </div>
  );
};

export default InteractiveMap;