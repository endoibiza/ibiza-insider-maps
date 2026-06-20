import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { trackPageView } from "@/lib/analytics";

const RouteAnalytics = () => {
  const location = useLocation();
  const lastPageKey = useRef<string | null>(null);

  useEffect(() => {
    const pageKey = `${location.pathname}${location.search}`;
    if (lastPageKey.current === pageKey) return;

    lastPageKey.current = pageKey;
    trackPageView(location);
  }, [location]);

  return null;
};

export default RouteAnalytics;
