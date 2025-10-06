import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CloudSun, Loader2 } from 'lucide-react';
import { WeatherSkeleton } from '@/components/ui/skeleton-loaders';

interface WeatherWidgetProps {
  autoLoad?: boolean;
}

const WeatherWidget = ({ autoLoad = false }: WeatherWidgetProps) => {
  const [loading, setLoading] = useState(false);
  const [weatherData, setWeatherData] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchWeather = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-weather', {
        body: {}
      });

      if (error) throw error;

      if (data?.weather) {
        setWeatherData(data.weather);
      } else {
        throw new Error('No weather data received');
      }
    } catch (error) {
      console.error('Weather fetch error:', error);
      toast({
        title: "Weather Error",
        description: error instanceof Error ? error.message : "Failed to fetch weather data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoLoad) {
      fetchWeather();
    }
  }, [autoLoad]);

  return (
    <Card className="w-full bg-gradient-card border-0 shadow-subtle">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CloudSun className="w-5 h-5 text-primary" />
          Ibiza Current Weather
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading && !weatherData ? (
          <div className="space-y-4">
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading current weather data...</p>
            </div>
            <WeatherSkeleton />
          </div>
        ) : !weatherData ? (
          <div className="text-center py-4">
            <p className="text-muted-foreground mb-4">
              Get a comprehensive weather report for Ibiza with data from multiple sources
            </p>
            <Button 
              onClick={fetchWeather} 
              disabled={loading}
              className="w-full sm:w-auto"
            >
              <CloudSun className="w-4 h-4 mr-2" />
              Get Current Weather
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div 
              className="prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: weatherData }}
            />
            <Button 
              variant="outline" 
              onClick={fetchWeather}
              disabled={loading}
              className="w-full sm:w-auto"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Refreshing...
                </>
              ) : (
                'Refresh Weather'
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default WeatherWidget;
