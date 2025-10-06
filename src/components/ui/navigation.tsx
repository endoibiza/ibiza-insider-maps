import * as React from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { MenuIcon, MapPinIcon } from "lucide-react";
import { getCategories } from "@/data/maps-data";

const Navigation = () => {
  const location = useLocation();
  const categories = getCategories();
  const [isOpen, setIsOpen] = React.useState(false);

  const navItems = [
    { name: "Explore All", href: "/map", icon: MapPinIcon },
    ...categories.map(category => ({
      name: category,
      href: `/category/${category.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')}`,
      icon: undefined as any,
    }))
  ];

  return (
    <nav className="border-b bg-gradient-card shadow-soft">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-hero rounded-lg flex items-center justify-center">
              <MapPinIcon className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold bg-gradient-hero bg-clip-text text-transparent">
              Ibiza Insider
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            {navItems.slice(0, 6).map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              
              return (
                <Link key={item.name} to={item.href}>
                  <Button 
                    variant={isActive ? "default" : "ghost"} 
                    size="sm"
                    className={cn(
                      "transition-all duration-200",
                      isActive ? "shadow-medium" : "hover:shadow-soft"
                    )}
                  >
                    {Icon && <Icon className="w-4 h-4 mr-2" />}
                    {item.name}
                  </Button>
                </Link>
              );
            })}
            {navItems.length > 6 && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="sm">
                    More
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-80">
                  <div className="mt-6 space-y-2">
                    {navItems.slice(6).map((item) => (
                      <Link key={item.name} to={item.href}>
                        <Button 
                          variant="ghost" 
                          className="w-full justify-start"
                          onClick={() => setIsOpen(false)}
                        >
                          {item.name}
                        </Button>
                      </Link>
                    ))}
                  </div>
                </SheetContent>
              </Sheet>
            )}
          </div>

          {/* Mobile Navigation */}
          <div className="md:hidden">
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MenuIcon className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80">
                <div className="mt-6 space-y-2">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.href;
                    
                    return (
                      <Link key={item.name} to={item.href}>
                        <Button 
                          variant={isActive ? "default" : "ghost"}
                          className="w-full justify-start"
                          onClick={() => setIsOpen(false)}
                        >
                          {Icon && <Icon className="w-4 h-4 mr-2" />}
                          {item.name}
                        </Button>
                      </Link>
                    );
                  })}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;