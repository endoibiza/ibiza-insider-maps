-- Keep public news views read-only for browser clients.

REVOKE ALL ON public.ibiza_news_public FROM anon, authenticated;
REVOKE ALL ON public.ibiza_news_daily_digests_public FROM anon, authenticated;

GRANT SELECT ON public.ibiza_news_public TO anon, authenticated;
GRANT SELECT ON public.ibiza_news_daily_digests_public TO anon, authenticated;
