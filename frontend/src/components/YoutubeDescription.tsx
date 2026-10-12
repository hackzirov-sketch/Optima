import { CalendarDays, Heart, MessageSquare, PlaySquare, Youtube } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { api, type YoutubeDetails } from "../lib/api";
import { useI18n } from "../lib/i18n/i18n";

/** Links, #hashtags and line breaks in a YouTube description, safely as React nodes. */
function richText(text: string, onHashtag: (tag: string) => void) {
  return text.split(/(https?:\/\/[^\s]+|#[\p{L}\p{N}_]+)/u).map((part, index) => {
    if (/^https?:\/\//.test(part)) return <a key={index} href={part} target="_blank" rel="noopener noreferrer">{part.length > 60 ? `${part.slice(0, 57)}…` : part}</a>;
    if (/^#[\p{L}\p{N}_]+$/u.test(part)) return <button key={index} type="button" className="yt-hashtag" onClick={() => onHashtag(part.slice(1))}>{part}</button>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

/**
 * YouTube's expandable description box under the player: views · date ·
 * hashtags, the description itself (collapsed to a few lines), the channel
 * with its subscriber count, and a "Video details" table.
 */
export function YoutubeDescription({ videoId, onSearch }: { videoId: string; onSearch: (query: string) => void }) {
  const { t, locale } = useI18n();
  const [details, setDetails] = useState<YoutubeDetails | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setDetails(null);
    setOpen(false);
    let cancelled = false;
    api.youtube.details(videoId).then((result) => { if (!cancelled) setDetails(result); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [videoId]);

  if (!details) return null;
  const exact = (count: number | null) => count == null ? "—" : new Intl.NumberFormat(locale).format(count);
  const compact = (count: number) => new Intl.NumberFormat(locale, { notation: "compact" }).format(count);
  const date = details.publishedAt ? new Date(details.publishedAt).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" }) : null;
  const hashtags = Array.from(new Set((details.description.match(/#[\p{L}\p{N}_]+/gu) ?? []).slice(0, 4)));
  const channel = details.channel;

  return <section className={`yt-desc ${open ? "open" : ""}`} onClick={() => { if (!open) setOpen(true); }}>
    <p className="yt-desc-stats">
      <strong>{open ? t("youtube.viewsExact", { count: exact(details.views) }) : details.views != null ? t("youtube.views", { count: compact(details.views) }) : ""}</strong>
      {date && <strong>{date}</strong>}
      {hashtags.map((tag) => <button key={tag} type="button" className="yt-hashtag" onClick={(event) => { event.stopPropagation(); onSearch(tag.slice(1)); }}>{tag}</button>)}
    </p>
    {details.description && <div className="yt-desc-text">{richText(details.description, onSearch)}</div>}
    {!open && details.description && <button type="button" className="yt-desc-toggle" onClick={(event) => { event.stopPropagation(); setOpen(true); }}>{t("youtube.showMore")}</button>}
    {open && <>
      {channel && <div className="yt-desc-channel">
        <span className="yt-desc-channel-head">
          {channel.avatarUrl ? <img src={channel.avatarUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <b>{channel.title.charAt(0).toUpperCase()}</b>}
          <span><strong>{channel.title}</strong>{channel.subscribers != null && <small>{t("youtube.subscribers", { count: compact(channel.subscribers) })}</small>}</span>
        </span>
        <span className="yt-desc-channel-links">
          <button type="button" className="yt-pill" onClick={() => onSearch(channel.title)}><PlaySquare size={17} />{t("youtube.channelVideos")}</button>
          <a className="yt-pill" href={channel.handle ? `https://www.youtube.com/${channel.handle}` : `https://www.youtube.com/channel/${channel.id}`} target="_blank" rel="noopener noreferrer"><Youtube size={17} />{t("youtube.channelOnYoutube")}</a>
        </span>
      </div>}
      <h4>{t("youtube.videoDetails")}</h4>
      <dl className="yt-desc-table">
        {date && <div><dt><CalendarDays size={16} />{t("youtube.dateLabel")}</dt><dd>{date}</dd></div>}
        <div><dt><PlaySquare size={16} />{t("youtube.viewsLabel")}</dt><dd>{exact(details.views)}</dd></div>
        <div><dt><Heart size={16} />{t("youtube.likesLabel")}</dt><dd>{exact(details.likes)}</dd></div>
        {details.comments != null && <div><dt><MessageSquare size={16} />{t("youtube.commentsLabel")}</dt><dd>{exact(details.comments)}</dd></div>}
      </dl>
      <button type="button" className="yt-desc-toggle" onClick={(event) => { event.stopPropagation(); setOpen(false); }}>{t("youtube.showLess")}</button>
    </>}
  </section>;
}
