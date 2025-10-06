import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  MapPinIcon, 
  SearchIcon, 
  FilterIcon, 
  ExternalLinkIcon,
  ListIcon,
  GridIcon
} from "lucide-react";
import { parseMapData, getCategories, type MapLocation } from "@/data/maps-data";
import { useAuth } from "@/components/AuthProvider";
import PaywallModal from "@/components/PaywallModal";
import SEOHead from "@/components/SEOHead";

const MapPage = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showPaywall, setShowPaywall] = useState(false);
  const { hasPremiumAccess } = useAuth();
  
  const allLocations = parseMapData();
  const categories = ["All", ...getCategories()];
  
  const filteredLocations = useMemo(() => {
    let filtered = allLocations;
    
    if (selectedCategory !== "All") {
      filtered = filtered.filter(location => location.category === selectedCategory);
    }
    
    if (searchTerm) {
      filtered = filtered.filter(location =>
        location.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        location.category.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    return filtered;
  }, [allLocations, selectedCategory, searchTerm]);

  const handleLocationClick = (e: React.MouseEvent, url: string) => {
    if (!hasPremiumAccess) {
      e.preventDefault();
      setShowPaywall(true);
      return;
    }
  };

  return (
    <>
      <SEOHead 
        title="Browse All Ibiza Maps - 84+ Curated Google Maps Lists"
        description="Explore 84+ categorized Google Maps collections for Ibiza: beaches, clubs, restaurants, villages, hotels & more. Searchable and filterable."
        keywords="Ibiza maps, Google Maps Ibiza, Ibiza collections, beach maps, club listings, restaurant guide"
        canonicalPath="/map"
      />
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-4">
            Explore All Locations
          </h1>
          <p className="text-lg text-muted-foreground mb-6">
            Discover {allLocations.length} hand-curated spots across Ibiza and Formentera
          </p>
          
          {/* Search and Filters */}
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
            <div className="relative flex-1 max-w-md">
              <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search locations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === "grid" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("grid")}
              >
                <GridIcon className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("list")}
              >
                <ListIcon className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Category Filters */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <FilterIcon className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filter by category:</span>
          </div>
          
          <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full">
            <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-1 h-auto p-1">
              {categories.slice(0, 12).map((category) => (
                <TabsTrigger
                  key={category}
                  value={category}
                  className="text-xs px-2 py-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {category}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          
          {categories.length > 12 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {categories.slice(12).map((category) => (
                <Button
                  key={category}
                  variant={selectedCategory === category ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(category)}
                  className="text-xs"
                >
                  {category}
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* Results Count */}
        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {filteredLocations.length} of {allLocations.length} locations
            {selectedCategory !== "All" && ` in ${selectedCategory}`}
            {searchTerm && ` matching "${searchTerm}"`}
          </p>
        </div>

        {/* Locations Grid/List */}
        {viewMode === "grid" ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredLocations.map((location) => (
              <a
                href={location.url}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
                onClick={(e) => handleLocationClick(e, location.url)}
              >
                <Card
                  key={location.id}
                  className="group hover:shadow-medium transition-all duration-300 cursor-pointer"
                >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg leading-tight group-hover:text-primary transition-colors line-clamp-2">
                        {location.name}
                      </CardTitle>
                    </div>
                    <ExternalLinkIcon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0 ml-2" />
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <Badge variant="secondary" className="text-xs">
                    {location.category}
                  </Badge>
                </CardContent>
              </Card>
              </a>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredLocations.map((location) => (
              <a
                href={location.url}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
                onClick={(e) => handleLocationClick(e, location.url)}
              >
                <Card
                  key={location.id}
                  className="group hover:shadow-soft transition-all duration-300 cursor-pointer"
                >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      <MapPinIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium group-hover:text-primary transition-colors truncate">
                          {location.name}
                        </h3>
                        <Badge variant="secondary" className="text-xs mt-1">
                          {location.category}
                        </Badge>
                      </div>
                    </div>
                    <ExternalLinkIcon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                  </div>
                </CardContent>
              </Card>
              </a>
            ))}
          </div>
        )}

        {/* Empty State */}
        {filteredLocations.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-muted rounded-full mx-auto mb-4 flex items-center justify-center">
              <SearchIcon className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No locations found</h3>
            <p className="text-muted-foreground mb-4">
              Try adjusting your search or filter criteria
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setSearchTerm("");
                setSelectedCategory("All");
              }}
            >
              Clear filters
            </Button>
          </div>
        )}

        <PaywallModal 
          isOpen={showPaywall}
          onClose={() => setShowPaywall(false)}
          featureName="map locations"
        />
      </div>
      </div>
    </>
  );
};

export default MapPage;