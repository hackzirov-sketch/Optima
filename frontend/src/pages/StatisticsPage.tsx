import { useEffect, useMemo, useState } from "react";
import { BarChart3, BookOpen, GraduationCap, MessageCircle, Video } from "lucide-react";
import { useAuth } from "../lib/auth";
import { readUsage, type UsageDay } from "../lib/usage";
import "../statistics.css";

const services = [{ key: "meetings", label: "Meeting", icon: Video }, { key: "chat", label: "Chat", icon: MessageCircle }, { key: "library", label: "Kutubxona", icon: BookOpen }, { key: "education", label: "Ta'lim", icon: GraduationCap }] as const;
function duration(seconds: number) { return seconds < 60 ? `${Math.round(seconds)} soniya` : `${Math.floor(seconds / 3600)} soat ${Math.floor(seconds % 3600 / 60)} daqiqa`; }
export function StatisticsPage() {
  const { user } = useAuth();
  const [range, setRange] = useState("7");
  const [service, setService] = useState("all");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [rows, setRows] = useState<UsageDay[]>([]);
  useEffect(() => { const load = () => setRows(user ? readUsage(user.id) : []); load(); window.addEventListener("optima-usage-update", load); window.addEventListener("storage", load); return () => { window.removeEventListener("optima-usage-update", load); window.removeEventListener("storage", load); }; }, [user?.id]);
  const filtered = useMemo(() => {
    const matching = rows.filter(row => service === "all" || row.service === service);
    if (range === "all") return matching;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const start = new Date(`${today}T00:00:00Z`); start.setUTCDate(start.getUTCDate() - Number(range) + 1);
    return matching.filter(row => row.date >= start.toISOString().slice(0, 10));
  }, [range, rows, service]);
  const totals = services.map(service => ({ ...service, seconds: filtered.filter(row => row.service === service.key).reduce((sum, row) => sum + row.seconds, 0), visits: filtered.filter(row => row.service === service.key).reduce((sum, row) => sum + row.visits, 0) }));
  const total = totals.reduce((sum, item) => sum + item.seconds, 0);
  const previous = useMemo(() => {
    if (range === "all") return null;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const end = new Date(`${today}T00:00:00Z`); end.setUTCDate(end.getUTCDate() - Number(range) + 1);
    const start = new Date(end); start.setUTCDate(start.getUTCDate() - Number(range));
    const matching = rows.filter(row => row.date >= start.toISOString().slice(0,10) && row.date < end.toISOString().slice(0,10) && (service === "all" || row.service === service));
    return matching.length ? matching.reduce((sum,row) => sum + row.seconds,0) : null;
  }, [range, rows, service]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const firstDate = filtered.length ? [...filtered.map(row => row.date)].sort()[0] : today;
  const dayCount = range === "all" ? Math.min(90, Math.round((Date.parse(today) - Date.parse(firstDate)) / 86400000) + 1) : Number(range);
  const daily = Array.from({ length: dayCount }, (_,index) => {
    const value = new Date(`${today}T00:00:00Z`); value.setUTCDate(value.getUTCDate() - dayCount + index + 1);
    const date = value.toISOString().slice(0,10);
    const matches = filtered.filter(row => row.date === date);
    return { date, recorded: matches.length > 0, seconds: matches.reduce((sum,row) => sum + row.seconds,0) };
  });
  const max = Math.max(1, ...daily.map(day => day.seconds));
  return <div className="page statistics-page">
    <header className="statistics-header"><div><h1>Faoliyat statistikasi</h1></div><select aria-label="Xizmat" value={service} onChange={event => { setService(event.target.value); setSelectedDay(null); }}><option value="all">Barcha xizmatlar</option>{services.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></header>
    <div className="statistics-periods" role="group" aria-label="Vaqt oralig'i">{["1","7","30","90","all"].map(value => <button key={value} aria-pressed={range === value} onClick={() => { setRange(value); setSelectedDay(null); }}>{value === "all" ? "Butun davr" : `${value} kun`}</button>)}</div>
    <details className="statistics-data-note"><summary>Shaxsiy faollik · shu brauzer</summary><p>Hisoblash ushbu yangilanishdan boshlangan; avvalgi foydalanish ma'lumoti mavjud emas. Qayd etilmagan kunlar nol faollik degani emas.</p></details>
    <section className="statistics-summary"><span>Jami faol vaqt</span><strong>{duration(total)}</strong><small>{filtered.reduce((sum,row) => sum + row.visits, 0)} marta bo'lim ochilgan</small></section>
    {range !== "all" && <p className="statistics-note">{previous === null ? "Oldingi teng davr uchun ma'lumot hali yetarli emas." : `Oldingi davr: ${duration(previous)}. Farq: ${total >= previous ? "+" : "-"}${duration(Math.abs(total - previous))}.`}</p>}
    <div className="statistics-analysis">
    <section className="statistics-history"><h2>Faollik ritmi</h2>{filtered.length ? <><div className="statistics-timeline">{daily.map(day => <button key={day.date} className={day.recorded ? "recorded" : "unrecorded"} aria-pressed={(selectedDay || today) === day.date} aria-label={`${day.date}: ${day.recorded ? duration(day.seconds) : "Ma'lumot yo'q"}`} title={`${day.date}: ${day.recorded ? duration(day.seconds) : "Ma'lumot yo'q"}`} onClick={() => setSelectedDay(day.date)}><span><i style={{ height: `${Math.max(2, day.seconds / max * 100)}%` }} /></span><time dateTime={day.date}>{day.date.slice(5)}</time></button>)}</div><div className="statistics-day"><strong>{selectedDay || today}</strong><span>{daily.find(day => day.date === (selectedDay || today))?.recorded ? duration(daily.find(day => day.date === (selectedDay || today))!.seconds) : "Ma'lumot yo'q"}</span></div></> : <div className="statistics-no-activity"><BarChart3 size={32} /><h3>Faollik hali boshlanmagan</h3><p>Tanlangan davrda qayd etilgan vaqt mavjud emas.</p></div>}</section>
    <section className="statistics-grid" aria-label="Xizmatlar bo'yicha foydalanish"><h2>Xizmatlar kesimi</h2>{totals.map(item => <button key={item.key} aria-pressed={service === item.key} onClick={() => setService(current => current === item.key ? "all" : item.key)}><span className="statistics-service-title"><item.icon size={20} /><strong>{item.label}</strong><b>{total ? Math.round(item.seconds / total * 100) : 0}%</b></span><progress max={Math.max(total,1)} value={item.seconds} aria-label={`${item.label} ulushi`} /><span className="statistics-service-meta"><span>{duration(item.seconds)}</span><span>{item.visits} ochilish</span></span></button>)}</section>
    </div>
  </div>;
}
