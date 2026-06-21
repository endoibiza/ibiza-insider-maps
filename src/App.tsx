import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/components/AuthProvider";
import RouteAnalytics from "@/components/RouteAnalytics";
import HomePage from "./pages/HomePage";
import MapPage from "./pages/MapPage";
import CategoryPage from "./pages/CategoryPage";
import AuthPage from "./pages/AuthPage";
import TaxiPage from "./pages/TaxiPage";
import WeatherPage from "./pages/WeatherPage";
import NewsPage from "./pages/NewsPage";
import EventsPage from "./pages/EventsPage";
import EventDetailPage from "./pages/EventDetailPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <RouteAnalytics />
          <div className="min-h-screen bg-background">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/map" element={<MapPage />} />
              <Route path="/category/:slug" element={<CategoryPage />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/taxi" element={<TaxiPage />} />
              <Route path="/weather" element={<WeatherPage />} />
              <Route path="/news" element={<NewsPage />} />
              <Route path="/events" element={<EventsPage />} />
              <Route path="/events/:slug" element={<EventDetailPage />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </div>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
