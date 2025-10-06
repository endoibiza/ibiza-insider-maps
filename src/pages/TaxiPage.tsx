import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import SEOHead from "@/components/SEOHead";

const TaxiPage = () => {
  // Taxi numbers data
  const taxiNumbers = [
    { area: "Ibiza Town", number: "+34 971 39 84 83", service: "Radio Taxi Eivissa" },
    { area: "Sant Josep", number: "+34 971 80 00 80", service: "Radio Taxi Sant Josep" },
    { area: "San Antoni", number: "+34 971 34 37 64", service: "Radio Taxi San Antoni" },
    { area: "Santa Eularia", number: "+34 971 33 33 33", service: "Radio Taxi Santa Eularia" },
    { area: "Sant Joan", number: "+34 971 33 33 33", service: "Radio Taxi Sant Joan" },
    { area: "All Island", number: "+34 971 33 33 33", service: "General Island Service" }
  ];

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": "Ibiza Taxi Services Directory",
    "description": "Complete directory of official taxi services across all areas of Ibiza",
    "areaServed": "Ibiza, Balearic Islands, Spain"
  };

  return (
    <>
      <SEOHead 
        title="Ibiza Taxi Numbers - Official Taxi Services Directory"
        description="Official taxi numbers for all areas of Ibiza. Radio Taxi services for Ibiza Town, Sant Josep, San Antoni, Santa Eularia & more. Reliable island-wide transport."
        keywords="Ibiza taxi, taxi Ibiza, Ibiza taxi numbers, Radio Taxi Eivissa, Sant Josep taxi, Santa Eularia taxi"
        canonicalPath="/taxi"
        structuredData={structuredData}
      />
      <div className="min-h-screen bg-background">
        {/* Header */}
      <div className="border-b border-border/40 bg-background/95 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" asChild>
              <Link to="/">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Link>
            </Button>
            <h1 className="text-xl font-bold">Essential Taxi Numbers</h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <section className="py-20">
        <div className="container mx-auto px-4 max-w-2xl">
          <div className="text-center mb-12">
            <div className="text-6xl mb-6">🚖</div>
            <h1 className="text-3xl md:text-4xl font-bold mb-4">Ibiza Taxi Numbers</h1>
            <p className="text-xl text-muted-foreground">
              Reliable taxi services across all areas of Ibiza. Save these numbers for quick and easy transportation around the island.
            </p>
          </div>
          
          <div className="space-y-4">
            {taxiNumbers.map((taxi, index) => (
              <Card key={index} className="hover:shadow-medium transition-all duration-300">
                <CardContent className="p-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-semibold text-lg">{taxi.area}</h3>
                      <p className="text-muted-foreground">{taxi.service}</p>
                    </div>
                    <Button variant="outline" size="lg" asChild>
                      <a href={`tel:${taxi.number}`} className="font-mono text-lg">
                        {taxi.number}
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          
          <div className="text-center mt-12 p-6 bg-gradient-card rounded-lg">
            <h3 className="font-semibold text-lg mb-2">Alternative Transport</h3>
            <p className="text-muted-foreground mb-4">For app-based booking and payment</p>
            <Button variant="outline" size="lg" className="font-semibold">
              Use UBER App
            </Button>
          </div>
        </div>
      </section>
      </div>
    </>
  );
};

export default TaxiPage;