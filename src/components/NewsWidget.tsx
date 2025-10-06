import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Newspaper, Loader2 } from 'lucide-react';
import { NewsSkeleton } from '@/components/ui/skeleton-loaders';

interface NewsWidgetProps {
  autoLoad?: boolean;
}

const NewsWidget = ({ autoLoad = false }: NewsWidgetProps) => {
  const [loading, setLoading] = useState(false);
  const [newsData, setNewsData] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchNews = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-news', {
        body: {}
      });

      if (error) throw error;

      if (data?.news) {
        setNewsData(data.news);
      } else {
        throw new Error('No news data received');
      }
    } catch (error) {
      console.error('News fetch error:', error);
      toast({
        title: "News Error",
        description: error instanceof Error ? error.message : "Failed to fetch news data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoLoad) {
      fetchNews();
    }
  }, [autoLoad]);

  return (
    <Card className="w-full bg-gradient-card border-0 shadow-subtle">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Newspaper className="w-5 h-5 text-primary" />
          Ibiza Daily News Digest
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading && !newsData ? (
          <div className="space-y-4">
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading today's news digest...</p>
            </div>
            <NewsSkeleton />
          </div>
        ) : !newsData ? (
          <div className="text-center py-4">
            <p className="text-muted-foreground mb-4">
              Get today's comprehensive news digest for Ibiza from multiple trusted sources
            </p>
            <Button 
              onClick={fetchNews} 
              disabled={loading}
              className="w-full sm:w-auto"
            >
              <Newspaper className="w-4 h-4 mr-2" />
              Get Today's News
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div 
              className="prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: newsData }}
            />
            <Button 
              variant="outline" 
              onClick={fetchNews}
              disabled={loading}
              className="w-full sm:w-auto"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Refreshing...
                </>
              ) : (
                'Refresh News'
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default NewsWidget;
