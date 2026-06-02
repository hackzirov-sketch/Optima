'use client';


﻿import { useMemo, useState } from "react";
import { Bookmark, Flame, Newspaper, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ActionButton, PageHeader, PageShell, Pill, SectionTitle, SimpleTabs, SurfaceCard } from "@/components/app/DesignSystem";
import { NEWS_ARTICLES } from "@/data/ecosystemData";
import type { UserProfile } from "@/types";



const NEWS_TABS = ["personalized", "trending", "saved"] as const;

import { useAuth } from "@/hooks/useAuth";

export default function Page() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<(typeof NEWS_TABS)[number]>("personalized");
  const [savedIds, setSavedIds] = useState(() => NEWS_ARTICLES.filter((article) => article.saved).map((article) => article.id));
  const [selectedId, setSelectedId] = useState(NEWS_ARTICLES[0].id);
  const [query, setQuery] = useState("");

  const localizedArticles = useMemo(() => {
    return NEWS_ARTICLES.map((article) => ({
      ...article,
      title: t(`app.news.articles.${article.id}.title`, article.title),
      category: t(`app.news.articles.${article.id}.category`, article.category),
      summary: t(`app.news.articles.${article.id}.summary`, article.summary),
      readTime: t(`app.news.articles.${article.id}.readTime`, article.readTime),
    }));
  }, [t]);

  const articles = useMemo(() => {

    return localizedArticles.filter((article) => {
      if (activeTab === "trending" && !article.trending) return false;
      if (activeTab === "saved" && !savedIds.includes(article.id)) return false;
      if (!query.trim()) return true;
      return `${article.title} ${article.category} ${article.summary}`.toLowerCase().includes(query.toLowerCase());
    });
  }, [activeTab, localizedArticles, query, savedIds]);

  const selected = localizedArticles.find((article) => article.id === selectedId) ?? localizedArticles[0];
  const tabLabels = Object.fromEntries(NEWS_TABS.map((tab) => [tab, t(`app.news.tabs.${tab}`)])) as Record<(typeof NEWS_TABS)[number], string>;

  const toggleSaved = (articleId: string) => {
    setSavedIds((current) => (current.includes(articleId) ? current.filter((id) => id !== articleId) : [...current, articleId]));
  };

  return (
      <PageShell>
        <PageHeader
          eyebrow={t("app.news.eyebrow")}
          title={t("app.news.title")}
          description={t("app.news.description")}
        >
          <ActionButton variant="secondary"><Search className="h-4 w-4" /> {t("app.news.tuneFeed")}</ActionButton>
        </PageHeader>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <SimpleTabs tabs={NEWS_TABS} labels={tabLabels} value={activeTab} onChange={(tab) => setActiveTab(tab as (typeof NEWS_TABS)[number])} />
          <div className="flex h-10 w-full items-center gap-2 rounded-2xl border border-border bg-card px-3 shadow-sm md:w-72 lg:w-80">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("app.news.searchArticles")}
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
          <SurfaceCard>
            <SectionTitle icon={Newspaper} title={t("app.news.feed")} description={t("app.news.personalizedFor", { profession: t(`app.professions.${user?.profession}`, user?.profession ?? "") })} />
            <div className="space-y-3">
              {articles.map((article) => (
                <button
                  key={article.id}
                  type="button"
                  onClick={() => setSelectedId(article.id)}
                  className="w-full rounded-2xl border border-border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone="blue">{article.category}</Pill>
                        {article.trending && <Pill tone="red">{t("app.news.trending")}</Pill>}
                      </div>
                      <h3 className="mt-3 font-semibold leading-snug text-foreground">{article.title}</h3>
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground">{article.readTime}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{article.summary}</p>
                </button>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle
              icon={Flame}
              title={t("app.news.articleView")}
              description={t("app.news.articleViewDesc")}
              action={
                <ActionButton variant={savedIds.includes(selected.id) ? "secondary" : "primary"} onClick={() => toggleSaved(selected.id)}>
                  <Bookmark className="h-4 w-4" /> {savedIds.includes(selected.id) ? t("app.news.saved") : t("app.news.save")}
                </ActionButton>
              }
            />
            <article className="rounded-2xl bg-muted p-6">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone="indigo">{selected.category}</Pill>
                <span className="text-sm text-muted-foreground">{t("app.news.readLabel", { time: selected.readTime })}</span>
              </div>
              <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">{selected.title}</h1>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">{selected.summary}</p>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">{t("app.news.productionBody")}</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {["recommended", "role", "tasks"].map((item) => (
                  <div key={item} className="rounded-2xl border border-border bg-card p-3 text-sm font-semibold text-foreground shadow-sm">
                    {t(`app.news.related.${item}`)}
                  </div>
                ))}
              </div>
            </article>
          </SurfaceCard>
        </div>
      </PageShell>
  );
}
