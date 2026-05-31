import { Link } from "wouter";
import { useTranslation } from "react-i18next";

export function Footer() {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-background border-t border-border pt-16 pb-8">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">

          <div className="space-y-4">
            <Link href="/" className="flex items-center gap-2 group w-fit">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
                O
              </div>
              <span className="font-bold text-xl tracking-tight text-foreground">Optima</span>
            </Link>
            <p className="text-muted-foreground text-sm leading-relaxed max-w-xs">{t("footer.tagline")}</p>
          </div>

          <div>
            <h4 className="font-semibold text-foreground mb-4">{t("footer.product")}</h4>
            <ul className="space-y-3">
              <li><a href="#features" className="text-muted-foreground hover:text-indigo-600 text-sm transition-colors">{t("footer.features")}</a></li>
              <li><a href="#how-it-works" className="text-muted-foreground hover:text-indigo-600 text-sm transition-colors">{t("footer.howItWorks")}</a></li>
              <li><a href="#" className="text-muted-foreground hover:text-indigo-600 text-sm transition-colors">{t("footer.pricing")}</a></li>
              <li><a href="#" className="text-muted-foreground hover:text-indigo-600 text-sm transition-colors">{t("footer.roadmap")}</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-foreground mb-4">{t("footer.community")}</h4>
            <ul className="space-y-3">
              <li><a href="#" className="text-muted-foreground hover:text-indigo-600 text-sm transition-colors">{t("footer.blog")}</a></li>
              <li><a href="#" className="text-muted-foreground hover:text-indigo-600 text-sm transition-colors">{t("footer.discord")}</a></li>
              <li><a href="#" className="text-muted-foreground hover:text-indigo-600 text-sm transition-colors">{t("footer.twitter")}</a></li>
              <li><a href="#" className="text-muted-foreground hover:text-indigo-600 text-sm transition-colors">{t("footer.github")}</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-foreground mb-4">{t("footer.legal")}</h4>
            <ul className="space-y-3">
              <li><a href="#" className="text-muted-foreground hover:text-indigo-600 text-sm transition-colors">{t("footer.privacy")}</a></li>
              <li><a href="#" className="text-muted-foreground hover:text-indigo-600 text-sm transition-colors">{t("footer.terms")}</a></li>
              <li><a href="#" className="text-muted-foreground hover:text-indigo-600 text-sm transition-colors">{t("footer.contact")}</a></li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-border/50 text-center">
          <p className="text-sm text-muted-foreground">{t("footer.copyright", { year: currentYear })}</p>
        </div>
      </div>
    </footer>
  );
}
