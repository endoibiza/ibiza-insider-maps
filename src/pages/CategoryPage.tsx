import React, { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

const CategoryPage = () => {
  const { slug } = useParams();
  const { hasPremiumAccess } = useAuth();

  // Category data mapping
  const categoryData: Record<string, { title: string; icon: string; lists: { name: string; url: string; description?: string }[] }> = {
    beaches: {
      title: "Beaches",
      icon: "🏖️",
      lists: [
        { 
          name: "Ibiza Beaches (Ibiza Beach Insider)", 
          url: "https://maps.app.goo.gl/moHbkoBsMeRWyG7o6",
          description: "Complete guide to all Ibiza beaches with insider tips"
        },
        { 
          name: "Formentera Beaches", 
          url: "https://maps.app.goo.gl/zdNEhVzSr7TnMXSg9",
          description: "The pristine beaches of Formentera island"
        }
      ]
    },
    formentera: {
      title: "Formentera",
      icon: "🏝️",
      lists: [
        { 
          name: "Formentera", 
          url: "https://maps.app.goo.gl/vuibXdGFpatp4WcX9",
          description: "Complete Formentera guide"
        },
        { 
          name: "Formentera Exploring", 
          url: "https://maps.app.goo.gl/8PBoAgDaLmsT7nWW6",
          description: "Beaches and outdoor fun in Formentera"
        }
      ]
    },
    "food-delivery": {
      title: "Food Delivery",
      icon: "🚚",
      lists: [
        { 
          name: "Zas Comida en tu boca", 
          url: "https://maps.app.goo.gl/945R6CNMzTbWWxfP7",
          description: "zascomidaentuboca.com delivery locations"
        },
        { 
          name: "Green Ibiza", 
          url: "https://maps.app.goo.gl/945R6CNMzTbWWxfP7",
          description: "greendeliveryibiza.com delivery areas"
        }
      ]
    },
    entertainment: {
      title: "Entertainment",
      icon: "🎭",
      lists: [
        { 
          name: "Movie Theatres", 
          url: "https://maps.app.goo.gl/pAXa4dkYbDWQm7u8A",
          description: "Cinema locations across Ibiza"
        }
      ]
    },
    fitness: {
      title: "Fitness",
      icon: "💪",
      lists: [
        { 
          name: "Gyms", 
          url: "https://maps.app.goo.gl/Y5VLhdsbkE8cZa28A",
          description: "Fitness centers and gyms in Ibiza"
        }
      ]
    },
    groceries: {
      title: "Groceries",
      icon: "🛒",
      lists: [
        { 
          name: "Supermarkets", 
          url: "https://maps.app.goo.gl/A3eFK7PQJpwPv37o9",
          description: "Grocery stores and supermarkets"
        }
      ]
    },
    "nature--outdoors": {
      title: "Nature & Outdoors",
      icon: "🌿",
      lists: [
        { 
          name: "Explore Ibiza", 
          url: "https://maps.app.goo.gl/LhnrauUunzPB83LcA",
          description: "Nature and outdoor fun"
        },
        { 
          name: "Formentera Exploring", 
          url: "https://maps.app.goo.gl/8PBoAgDaLmsT7nWW6",
          description: "Beaches and outdoor fun in Formentera"
        },
        { 
          name: "Farms", 
          url: "https://maps.app.goo.gl/VH339y9fCQUneRrx6",
          description: "Local farms to visit"
        },
        { 
          name: "Hiking", 
          url: "https://maps.app.goo.gl/52yYeuKcM2FgAJMP6",
          description: "Hiking trails and nature walks"
        }
      ]
    },
    services: {
      title: "Services",
      icon: "🔧",
      lists: [
        { 
          name: "Computer Repair", 
          url: "https://maps.app.goo.gl/1NGJbUqdPJ9a2Vvr6",
          description: "Tech support and computer repair"
        },
        { 
          name: "Dentists", 
          url: "https://maps.app.goo.gl/VsYzms33Z1GLxCrE8",
          description: "Dental services across the island"
        },
        { 
          name: "Vehicle Repair", 
          url: "https://maps.app.goo.gl/HExBoPVMjbbKvWGZ7",
          description: "Car and vehicle repair services"
        }
      ]
    },
    transport: {
      title: "Transport",
      icon: "🚗",
      lists: [
        { 
          name: "Ibiza Town Parking", 
          url: "https://maps.app.goo.gl/UatWHpWJHAekXRYHA",
          description: "Parking spots in Ibiza Town"
        },
        { 
          name: "Taxi Stands", 
          url: "https://maps.app.goo.gl/Tusqz6LUWPp2RiFD8",
          description: "Taxi pickup locations"
        },
        { 
          name: "Ibiza Taxi", 
          url: "https://maps.app.goo.gl/dZ3AYpeMeSdhyjfi6",
          description: "Taxi services across Ibiza"
        }
      ]
    }
  };

  const category = categoryData[slug || ""];

  // Update page title and meta for SEO
  useEffect(() => {
    if (category) {
      document.title = `${category.title} - Ibiza Insider`;
      
      // Add meta description
      const metaDescription = document.querySelector('meta[name="description"]');
      if (metaDescription) {
        metaDescription.setAttribute('content', `Discover the best ${category.title.toLowerCase()} in Ibiza with our curated Google Maps collections.`);
      }
    }
  }, [category]);

  if (!category) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Category Not Found</h1>
          <Button asChild>
            <Link to="/">Return Home</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!hasPremiumAccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Premium Access Required</h1>
          <p className="text-muted-foreground mb-6">This category requires premium access.</p>
          <Button asChild>
            <Link to="/">Return Home</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/40 bg-background/95 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" asChild>
              <Link to="/">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Link>
            </Button>
            <div className="flex items-center gap-3">
              <span className="text-2xl">{category.icon}</span>
              <h1 className="text-2xl font-bold">{category.title}</h1>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">
            {category.title} Collections
          </h2>
          <p className="text-xl text-muted-foreground">
            Curated Google Maps lists for {category.title.toLowerCase()}
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {category.lists.map((list, index) => (
            <Card key={index} className="group hover:shadow-medium transition-all duration-300 bg-gradient-card border-0">
              <CardContent className="p-6">
                <div className="text-center mb-4">
                  <div className="text-4xl mb-3">{category.icon}</div>
                  <h3 className="font-semibold text-lg mb-2 group-hover:text-primary transition-colors">
                    {list.name}
                  </h3>
                  {list.description && (
                    <p className="text-sm text-muted-foreground mb-4">
                      {list.description}
                    </p>
                  )}
                  <Badge variant="secondary" className="mb-4">
                    Google Maps List
                  </Badge>
                </div>
                <Button 
                  className="w-full"
                  asChild
                >
                  <a 
                    href={list.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    referrerPolicy="no-referrer"
                  >
                    Open in Google Maps
                  </a>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center mt-12">
          <Button variant="outline" asChild>
            <Link to="/">
              Return to Home
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CategoryPage;