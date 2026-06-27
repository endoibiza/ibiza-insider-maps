import { Link } from "react-router-dom";
import NewsWidget from "@/components/NewsWidget";
import SEOHead from "@/components/SEOHead";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Maps", href: "/" },
  { label: "Events", href: "/events" },
  { label: "Weather", href: "/weather" },
  { label: "News", href: "/news" },
  { label: "Clubs", href: "/clubs", beta: true },
];

const NewsPage = () => {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "NewsMediaOrganization",
    name: "Ibiza Maps News",
    description: "Source-backed daily Ibiza news in English from verified local feeds and official public sources.",
    url: "https://ibiza-maps.com/news",
    areaServed: "Ibiza, Balearic Islands, Spain",
  };

  return (
    <>
      <SEOHead
        title="Ibiza News Today — Verified Local Updates in English"
        description="Daily source-backed Ibiza news from local publications and official public sources, translated into English with direct source links."
        keywords="Ibiza news, Ibiza daily news, Diario de Ibiza, Periódico de Ibiza, Santa Eulària news, Ibiza local updates"
        canonicalPath="/news"
        structuredData={structuredData}
      />

      <div className="min-h-screen bg-slate-50">
        <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
            <Link to="/" className="text-lg font-semibold text-primary">
              Ibiza Maps
            </Link>

            <nav className="ml-auto flex min-w-0 items-center gap-1 overflow-x-auto text-sm font-medium">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "rounded-md px-3 py-2 text-slate-700 transition hover:bg-slate-100",
                    item.href === "/news" && "bg-slate-100 text-primary",
                  )}
                >
                  <span className="inline-flex items-center gap-2">
                    {item.label}
                    {item.beta && (
                      <Badge variant="outline" className="border-amber-300 bg-amber-50 px-2 py-0 text-[10px] text-amber-700">
                        Beta
                      </Badge>
                    )}
                  </span>
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main>
          <NewsWidget autoLoad />
        </main>
      </div>
    </>
  );
};

export default NewsPage;
