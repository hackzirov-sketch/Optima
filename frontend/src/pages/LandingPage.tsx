import { useState } from "react";
import { Link } from "wouter";
import { ArrowRight, BarChart3, BookOpen, BrainCircuit, Check, GraduationCap, Menu, MessageCircle, Moon, Sun, Video, X, Youtube } from "lucide-react";

const services = [
  { name: "Chat", icon: MessageCircle, tone: "violet", to: "/chat", text: "Yaqinlaringiz va jamoangiz bilan aloqada bo‘ling.", items: ["Shaxsiy va guruhli suhbatlar", "Kanallar, rasmlar va fayllar", "Ovozli xabarlar va reaksiyalar"] },
  { name: "Meeting", icon: Video, tone: "green", to: "/meetings", text: "Suhbatni yuzma-yuz uchrashuvga aylantiring.", items: ["Audio va video uchrashuvlar", "Ekranni ulashish", "Uchrashuv ichidagi chat"] },
  { name: "Ta’lim", icon: GraduationCap, tone: "gold", to: "/education", text: "O‘zingizga mos sur’atda yangi bilim oling.", items: ["Ingliz tili darslari va lug‘at", "1–11-sinf matematika mavzulari", "Mashqlar, hikoyalar va o‘yinlar"] },
  { name: "Kutubxona", icon: BookOpen, tone: "rose", to: "/library", text: "O‘qimoqchi bo‘lgan kitobingizni toping.", items: ["Mavzu va til bo‘yicha qidirish", "Ilova ichida kitob o‘qish", "Saqlanganlar va o‘qish ro‘yxati"] },
  { name: "AI yordamchi", icon: BrainCircuit, tone: "violet", to: "/ai", text: "Savol bering, fikrni rivojlantiring, matn ustida ishlang.", items: ["Alohida suhbatlar sahifasi", "Matn bilan ishlash", "Savollarga yordamchi javoblar"] },
  { name: "YouTube", icon: Youtube, tone: "rose", to: "/youtube", text: "Qiziqarli videolarni ilovadan chiqmay tomosha qiling.", items: ["Video qidirish", "Havola orqali video ochish", "OPTIMA ichida tomosha qilish"] },
];
const faqs = [
  ["OPTIMA kimlar uchun?", "Do‘stlari bilan aloqada bo‘lishni, jamoasi bilan ishlashni yoki yangi bilim olishni istagan har bir inson uchun. Bo‘limlar orasida o‘zingizga keraklisini tanlaysiz."],
  ["Boshlash uchun nima qilish kerak?", "Hisobingiz bo‘lsa, “Kirish” tugmasini bosing. Yangi foydalanuvchi bo‘lsangiz, “Hisob yaratish” orqali ro‘yxatdan o‘ting. Keyin ilova ichidagi bo‘limlarni ochishingiz mumkin."],
  ["Telefonda ham foydalanish mumkinmi?", "Ha. OPTIMA brauzerda ishlaydi va mobil ekranlarga moslashtirilgan. Alohida dastur o‘rnatmasdan ham saytdan foydalanishingiz mumkin."],
  ["Ta’lim bo‘limida nimalar bor?", "Ingliz tili grammatikasi, so‘zlar va lug‘at, o‘qish uchun hikoyalar, 1–11-sinf matematika mavzulari hamda mashqlar bor. Ta’limdagi AI ustoz hozircha oflayn demo rejimida; mashq natijalari foydalanayotgan brauzeringizda saqlanadi."],
  ["AI javoblariga to‘liq ishonish mumkinmi?", "AI yordamchi xato qilishi mumkin. Muhim ma’lumotlarni ishonchli manbalar, darslik yoki mutaxassis bilan tekshiring."],
];

export function LandingPage({ authenticated = false }: { authenticated?: boolean }) {
  const [menu, setMenu] = useState(false);
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem("optima-public-theme") === "dark"; } catch { return false; }
  });
  const start = authenticated ? "/chat" : "/login?mode=register";
  const enter = authenticated ? "/chat" : "/login";
  const toggleTheme = () => {
    setDark(current => {
      try { localStorage.setItem("optima-public-theme", current ? "light" : "dark"); } catch { /* Theme still changes when storage is unavailable. */ }
      return !current;
    });
  };
  return <div className="public-landing" data-scheme={dark ? "dark" : "light"}>
    <a className="landing-skip" href="#landing-main">Asosiy ma’lumotga o‘tish</a>
    <header className="landing-header">
      <Link className="landing-brand" href="/welcome" aria-label="OPTIMA bosh sahifa"><img src="/optima-logo.png" alt="" width="36" height="36" /><span>OPTIMA</span></Link>
      <nav id="landing-navigation" className={menu ? "is-open" : ""} aria-label="Sayt navigatsiyasi">
        <a href="#xizmatlar" onClick={() => setMenu(false)}>Imkoniyatlar</a>
        <a href="#talim" onClick={() => setMenu(false)}>Ta’lim</a>
        <a href="#savollar" onClick={() => setMenu(false)}>Savollar</a>
      </nav>
      <div className="landing-header-actions">
        <button className="landing-icon" onClick={toggleTheme} aria-label={dark ? "Yorug‘ rejimga o‘tish" : "To‘q rejimga o‘tish"} title={dark ? "Yorug‘ rejim" : "To‘q rejim"}>{dark ? <Sun size={20} /> : <Moon size={20} />}</button>
        <Link className="landing-login" href="/login">Kirish</Link>
        <Link className="landing-signup" href="/login?mode=register">Ro‘yxatdan o‘tish</Link>
        <button className="landing-icon landing-menu-toggle" onClick={() => setMenu(!menu)} aria-controls="landing-navigation" aria-expanded={menu} aria-label={menu ? "Menyuni yopish" : "Menyuni ochish"}>{menu ? <X /> : <Menu />}</button>
      </div>
    </header>
    <main id="landing-main">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <p className="landing-eyebrow">Aloqa. Bilim. Imkoniyat.</p>
          <h1 id="landing-title">OPTIMA</h1>
          <p className="landing-lead">Suhbat, uchrashuv va ta’lim.<br />Hammasi bir joyda.</p>
          <p className="landing-intro">Yaqinlaringiz bilan gaplashing, jamoangiz bilan uchrashing, kitob o‘qing va yangi bilim oling. Kerakli bo‘limni OPTIMA ichida oching.</p>
          <div className="landing-hero-actions"><Link className="landing-button" href={start}>{authenticated ? "OPTIMA’ni ochish" : "Hisob yaratish"}<ArrowRight size={18} /></Link><a className="landing-text-link" href="/chat?demo=1">Demoni ko‘rish<ArrowRight size={17} /></a></div>
          <nav className="landing-hero-sections" aria-label="OPTIMA imkoniyatlari">{services.map(({name, icon: Icon, to}) => <a key={to} href={`#service-${to.slice(1)}`}><Icon size={17} /><span>{name}</span></a>)}</nav>
        </div>
      </section>
      <section id="xizmatlar" className="landing-section landing-services" aria-labelledby="services-heading">
        <header className="landing-section-heading"><h2 id="services-heading">Kun davomida kerak<br />bo‘ladigan bo‘limlar.</h2><p>Bir vazifadan boshqasiga o‘ting. Aloqa, o‘qish va izlanish uchun alohida joylar — bitta ilovada.</p></header>
        <div className="landing-service-list">{services.map(({ name, icon: Icon, tone, to, text, items }) => <article id={`service-${to.slice(1)}`} key={to} className="landing-service">
          <div className="landing-service-name"><span className={`landing-service-icon ${tone}`}><Icon size={24} /></span><h3>{name}</h3></div>
          <div className="landing-service-copy"><p>{text}</p><ul>{items.map(item => <li key={item}><Check size={15} />{item}</li>)}</ul></div>
          <Link href={authenticated ? to : "/login"} className="landing-service-open" aria-label={`${name} bo‘limini ochish`} title={`${name} bo‘limini ochish`}><ArrowRight size={22} /></Link>
        </article>)}</div>
        <div className="landing-statistics"><BarChart3 size={24} /><div><h3>Faoliyatingizga bir qarash.</h3><p>Statistika bo‘limida xizmatlardan foydalanish vaqtini 1, 7, 30, 90 kun yoki butun davr bo‘yicha ko‘ring.</p></div><Link className="landing-text-link" href={authenticated ? "/statistics" : "/login"}>Statistika<ArrowRight size={17} /></Link></div>
      </section>
      <section id="talim" className="landing-learning" aria-labelledby="learning-heading">
        <div className="landing-section">
          <header className="landing-section-heading"><div><h2 id="learning-heading">Bilimga ham<br />joy ajrating.</h2><p>Ochgan darsingizga qayting, so‘zlarni takrorlang yoki matematika mavzusini tanlang. Kichik qadamlar bilan o‘qishni davom ettiring.</p><Link className="landing-button" href={authenticated ? "/education" : "/login"}>Ta’limni ochish<ArrowRight size={18} /></Link></div><ul className="landing-learning-topics"><li><BookOpen /><span>Ingliz tili<strong>Grammatika, so‘zlar va hikoyalar</strong></span></li><li><GraduationCap /><span>Matematika<strong>1–11-sinf mavzulari va mashqlar</strong></span></li><li><BrainCircuit /><span>AI ustoz<strong>Oflayn demo suhbat va mashqlar</strong></span></li></ul></header>
        </div>
      </section>
      <section className="landing-section landing-start" aria-labelledby="start-heading">
        <h2 id="start-heading">O‘zingizga kerakli<br />joydan boshlang.</h2>
        <ol><li><strong>Hisobingizga kiring</strong><p>Yangi hisob yarating yoki mavjud hisobingiz bilan kiring.</p></li><li><strong>Bo‘limni tanlang</strong><p>Suhbat, uchrashuv, kitob yoki dars — hozir sizga nima kerak?</p></li><li><strong>Davom eting</strong><p>Ilova ichidagi navigatsiya orqali boshqa bo‘limga o‘ting.</p></li></ol>
      </section>
      <section id="savollar" className="landing-section landing-faq" aria-labelledby="faq-heading"><h2 id="faq-heading">Savollaringiz bormi?</h2><div>{faqs.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div></section>
      <section className="landing-closing"><h2>Keyingi qadam — OPTIMA.</h2><p>Aloqa qilish, uchrashish va o‘rganish uchun.</p><Link className="landing-button" href={start}>{authenticated ? "Ilovaga o‘tish" : "Boshlash"}<ArrowRight size={18} /></Link></section>
    </main>
    <footer className="landing-footer"><Link className="landing-brand" href="/welcome"><img src="/optima-logo.png" width="30" height="30" alt="" /><span>OPTIMA</span></Link><span>© {new Date().getFullYear()} OPTIMA</span><a href="#xizmatlar">Imkoniyatlar</a><Link href={enter}>{authenticated ? "Ilovaga o‘tish" : "Kirish"}</Link></footer>
  </div>;
}
