import { createContext, useContext, useEffect, useState } from 'react';

/*
 * Interfeys tillari. Har bir kalit: [uz, ru, en, tr, kk, ky, tg, de].
 * O'quv kontenti (darslar, hikoyalar) o'zbekchada qoladi; lug'at tarjimasi RU tanlansa ruscha ko'rsatiladi.
 */
export const LANGS = [
  { code: 'uz', short: 'UZ', name: 'O‘zbekcha', speech: 'uz-UZ' },
  { code: 'ru', short: 'RU', name: 'Русский', speech: 'ru-RU' },
  { code: 'en', short: 'EN', name: 'English', speech: 'en-US' },
  { code: 'tr', short: 'TR', name: 'Türkçe', speech: 'tr-TR' },
  { code: 'kk', short: 'KZ', name: 'Қазақша', speech: 'kk-KZ' },
  { code: 'ky', short: 'KG', name: 'Кыргызча', speech: 'ky-KG' },
  { code: 'tg', short: 'TJ', name: 'Тоҷикӣ', speech: 'tg-TJ' },
  { code: 'de', short: 'DE', name: 'Deutsch', speech: 'de-DE' },
];
const ORDER = LANGS.map((l) => l.code);

const T = {
  'nav.home': ['Bosh sahifa', 'Главная', 'Home', 'Ana sayfa', 'Басты бет', 'Башкы бет', 'Саҳифаи асосӣ', 'Startseite'],
  'nav.avatar': ['Avatar ustoz', 'Аватар-учитель', 'Avatar tutor', 'Avatar öğretmen', 'Аватар-ұстаз', 'Аватар-мугалим', 'Аватар-устод', 'Avatar-Lehrer'],
  'nav.chat': ['AI chat', 'AI чат', 'AI chat', 'AI sohbet', 'AI чат', 'AI чат', 'AI чат', 'KI-Chat'],
  'nav.lessons': ['Darslar', 'Уроки', 'Lessons', 'Dersler', 'Сабақтар', 'Сабактар', 'Дарсҳо', 'Lektionen'],
  'nav.words': ['So‘zlar', 'Слова', 'Words', 'Kelimeler', 'Сөздер', 'Сөздөр', 'Калимаҳо', 'Wörter'],
  'nav.dictionary': ['Lug‘at', 'Словарь', 'Dictionary', 'Sözlük', 'Сөздік', 'Сөздүк', 'Луғат', 'Wörterbuch'],
  'nav.math': ['Matematika', 'Математика', 'Math', 'Matematik', 'Математика', 'Математика', 'Математика', 'Mathematik'],
  'nav.practice': ['Mashq va o‘yinlar', 'Практика и игры', 'Practice & games', 'Alıştırma ve oyunlar', 'Жаттығу мен ойындар', 'Көнүгүү жана оюндар', 'Машқ ва бозиҳо', 'Übungen & Spiele'],
  'nav.mistakes': ['Xatolar daftari', 'Тетрадь ошибок', 'Mistake notebook', 'Hata defteri', 'Қателер дәптері', 'Каталар дептери', 'Дафтари хатоҳо', 'Fehlerheft'],
  'nav.videos': ['Videolar', 'Видео', 'Videos', 'Videolar', 'Бейнелер', 'Видеолор', 'Видеоҳо', 'Videos'],
  'nav.courses': ['Tashqi kurslar', 'Внешние курсы', 'Courses', 'Kurslar', 'Курстар', 'Курстар', 'Курсҳо', 'Kurse'],
  'nav.rating': ['Reyting', 'Рейтинг', 'Leaderboard', 'Sıralama', 'Рейтинг', 'Рейтинг', 'Рейтинг', 'Rangliste'],
  'nav.community': ['Fikrlar', 'Мнения', 'Community', 'Topluluk', 'Пікірлер', 'Пикирлер', 'Фикрҳо', 'Community'],
  'nav.profile': ['Profil', 'Профиль', 'Profile', 'Profil', 'Профиль', 'Профиль', 'Профил', 'Profil'],
  'grp.learn': ['O‘qish', 'Учёба', 'Learn', 'Öğren', 'Оқу', 'Окуу', 'Омӯзиш', 'Lernen'],
  'grp.practice': ['Mashq', 'Практика', 'Practice', 'Pratik', 'Жаттығу', 'Көнүгүү', 'Машқ', 'Üben'],
  'grp.community': ['Hamjamiyat', 'Сообщество', 'Community', 'Topluluk', 'Қауымдастық', 'Коомчулук', 'Ҷомеа', 'Gemeinschaft'],
  'c.start': ['Boshlash', 'Начать', 'Start', 'Başla', 'Бастау', 'Баштоо', 'Оғоз', 'Starten'],
  'c.check': ['Tekshirish', 'Проверить', 'Check', 'Kontrol et', 'Тексеру', 'Текшерүү', 'Санҷидан', 'Prüfen'],
  'c.next': ['Keyingi', 'Далее', 'Next', 'Sonraki', 'Келесі', 'Кийинки', 'Навбатӣ', 'Weiter'],
  'c.save': ['Saqlash', 'Сохранить', 'Save', 'Kaydet', 'Сақтау', 'Сактоо', 'Нигоҳ доштан', 'Speichern'],
  'c.back': ['Orqaga', 'Назад', 'Back', 'Geri', 'Артқа', 'Артка', 'Бозгашт', 'Zurück'],
  'c.listen': ['Tinglash', 'Слушать', 'Listen', 'Dinle', 'Тыңдау', 'Угуу', 'Гӯш кардан', 'Anhören'],
  'c.continue': ['Davom etish', 'Продолжить', 'Continue', 'Devam et', 'Жалғастыру', 'Улантуу', 'Идома додан', 'Fortsetzen'],
  'c.restart': ['Qaytadan', 'Заново', 'Restart', 'Yeniden', 'Қайта', 'Кайра', 'Аз нав', 'Neu starten'],
  'c.search': ['Qidirish', 'Поиск', 'Search', 'Ara', 'Іздеу', 'Издөө', 'Ҷустуҷӯ', 'Suchen'],
  'c.all': ['Hammasi', 'Все', 'All', 'Tümü', 'Барлығы', 'Баары', 'Ҳама', 'Alle'],
  'c.level': ['Daraja', 'Уровень', 'Level', 'Seviye', 'Деңгей', 'Деңгээл', 'Сатҳ', 'Niveau'],
  'c.topic': ['Mavzu', 'Тема', 'Topic', 'Konu', 'Тақырып', 'Тема', 'Мавзӯъ', 'Thema'],
  'c.correct': ['To‘g‘ri!', 'Верно!', 'Correct!', 'Doğru!', 'Дұрыс!', 'Туура!', 'Дуруст!', 'Richtig!'],
  'c.wrong': ['Noto‘g‘ri', 'Неверно', 'Wrong', 'Yanlış', 'Қате', 'Туура эмес', 'Нодуруст', 'Falsch'],
  'c.logout': ['Chiqish', 'Выйти', 'Log out', 'Çıkış', 'Шығу', 'Чыгуу', 'Баромадан', 'Abmelden'],
  'c.login': ['Kirish', 'Войти', 'Log in', 'Giriş', 'Кіру', 'Кирүү', 'Даромадан', 'Anmelden'],
  'c.register': ['Ro‘yxatdan o‘tish', 'Регистрация', 'Sign up', 'Kayıt ol', 'Тіркелу', 'Катталуу', 'Сабти ном', 'Registrieren'],
  'c.language': ['Til', 'Язык', 'Language', 'Dil', 'Тіл', 'Тил', 'Забон', 'Sprache'],
  'c.days': ['kun', 'дн.', 'days', 'gün', 'күн', 'күн', 'рӯз', 'Tage'],
  'home.hello': ['Salom', 'Привет', 'Hi', 'Merhaba', 'Сәлем', 'Салам', 'Салом', 'Hallo'],
  'home.goal': ['Bugungi maqsad', 'Цель на сегодня', 'Today’s goal', 'Bugünkü hedef', 'Бүгінгі мақсат', 'Бүгүнкү максат', 'Ҳадафи имрӯз', 'Tagesziel'],
  'home.todayXp': ['Bugungi XP', 'XP сегодня', 'XP today', 'Bugünkü XP', 'Бүгінгі XP', 'Бүгүнкү XP', 'XP-и имрӯз', 'XP heute'],
  'home.streak': ['Ketma-ketlik', 'Серия', 'Streak', 'Seri', 'Тізбек', 'Удаалаш', 'Пайдарпай', 'Serie'],
  'home.words': ['O‘rganilgan so‘zlar', 'Выучено слов', 'Words learned', 'Öğrenilen kelimeler', 'Үйренген сөздер', 'Үйрөнүлгөн сөздөр', 'Калимаҳои омӯхта', 'Gelernte Wörter'],
  'home.lessons': ['Tugatilgan darslar', 'Пройдено уроков', 'Lessons done', 'Tamamlanan dersler', 'Аяқталған сабақтар', 'Бүткөн сабактар', 'Дарсҳои анҷомёфта', 'Abgeschlossene Lektionen'],
  'home.accuracy': ['Aniqlik', 'Точность', 'Accuracy', 'Doğruluk', 'Дәлдік', 'Тактык', 'Дақиқӣ', 'Genauigkeit'],
  'home.plan': ['Bugungi reja', 'План на сегодня', 'Today’s plan', 'Bugünkü plan', 'Бүгінгі жоспар', 'Бүгүнкү план', 'Нақшаи имрӯз', 'Plan für heute'],
  'home.week': ['Haftalik faollik', 'Активность за неделю', 'Weekly activity', 'Haftalık etkinlik', 'Апталық белсенділік', 'Жумалык активдүүлүк', 'Фаъолияти ҳафтаина', 'Wochenaktivität'],
  'auth.welcome': ['Xush kelibsiz!', 'Добро пожаловать!', 'Welcome back!', 'Hoş geldiniz!', 'Қош келдіңіз!', 'Кош келиңиз!', 'Хуш омадед!', 'Willkommen!'],
  'auth.sub': ['Hisobingizga kiring va o‘qishni davom ettiring.', 'Войдите и продолжайте учиться.', 'Log in and keep learning.', 'Giriş yapın ve öğrenmeye devam edin.', 'Кіріп, оқуды жалғастырыңыз.', 'Кирип, окууну улантыңыз.', 'Ворид шавед ва таҳсилро идома диҳед.', 'Melde dich an und lerne weiter.'],
  'auth.login': ['Telefon yoki email', 'Телефон или email', 'Phone or email', 'Telefon veya e-posta', 'Телефон не email', 'Телефон же email', 'Телефон ё email', 'Telefon oder E-Mail'],
  'auth.password': ['Parol', 'Пароль', 'Password', 'Şifre', 'Құпиясөз', 'Сырсөз', 'Рамз', 'Passwort'],
  'auth.name': ['Ism va familiya', 'Имя и фамилия', 'Full name', 'Ad soyad', 'Аты-жөні', 'Аты-жөнү', 'Ному насаб', 'Vor- und Nachname'],
  'auth.noAccount': ['Hisobingiz yo‘qmi?', 'Нет аккаунта?', 'No account?', 'Hesabınız yok mu?', 'Аккаунт жоқ па?', 'Аккаунт жокпу?', 'Ҳисоб надоред?', 'Kein Konto?'],
  'auth.haveAccount': ['Hisobingiz bormi?', 'Уже есть аккаунт?', 'Have an account?', 'Hesabınız var mı?', 'Аккаунт бар ма?', 'Аккаунт барбы?', 'Ҳисоб доред?', 'Schon ein Konto?'],
  'auth.demo': ['Demo hisob bilan kirish', 'Войти через демо', 'Try the demo', 'Demo ile giriş', 'Демо арқылы кіру', 'Демо менен кирүү', 'Бо демо ворид шудан', 'Demo ausprobieren'],
  'land.title': ['Gapiradigan AI ustoz bilan o‘qing', 'Учитесь с говорящим AI-учителем', 'Learn with a talking AI tutor', 'Konuşan yapay zekâ öğretmenle öğren', 'Сөйлейтін AI-ұстазбен оқы', 'Сүйлөгөн AI-мугалим менен оку', 'Бо устоди AI-и гапзананда омӯзед', 'Lerne mit einem sprechenden KI-Tutor'],
  'land.sub': ['Ingliz tili, matematika 1–11-sinf, lug‘at va o‘yinlar — o‘zbek tilida, sizga moslashadigan.', 'Английский, математика 1–11 кл., словарь и игры — на вашем языке и под ваш уровень.', 'English, math for grades 1–11, a dictionary and games — in your language, adapted to you.', 'İngilizce, 1–11. sınıf matematik, sözlük ve oyunlar — size uyum sağlar.', 'Ағылшын тілі, 1–11 сынып математикасы, сөздік және ойындар — сізге бейімделеді.', 'Англис тили, 1–11-класс математикасы, сөздүк жана оюндар — сизге ылайыкташат.', 'Забони англисӣ, математикаи синфҳои 1–11, луғат ва бозиҳо — мувофиқи шумо.', 'Englisch, Mathe Klasse 1–11, Wörterbuch und Spiele — passend für dich.'],
  'land.cta': ['Bepul boshlash', 'Начать бесплатно', 'Start for free', 'Ücretsiz başla', 'Тегін бастау', 'Акысыз баштоо', 'Ройгон оғоз кунед', 'Kostenlos starten'],
  'avatar.choose': ['Ustozingizni tanlang', 'Выберите учителя', 'Choose your tutor', 'Öğretmenini seç', 'Ұстазыңды таңда', 'Мугалимиңди танда', 'Устодатонро интихоб кунед', 'Wähle deinen Tutor'],
  'avatar.talk': ['Gapirish', 'Говорить', 'Talk', 'Konuş', 'Сөйлеу', 'Сүйлөө', 'Гап задан', 'Sprechen'],
  'avatar.listening': ['Tinglayapman…', 'Слушаю…', 'Listening…', 'Dinliyorum…', 'Тыңдап тұрмын…', 'Угуп жатам…', 'Гӯш мекунам…', 'Ich höre zu…'],
  'avatar.speaking': ['Gapiryapti…', 'Говорит…', 'Speaking…', 'Konuşuyor…', 'Сөйлеп тұр…', 'Сүйлөп жатат…', 'Гап мезанад…', 'Spricht…'],
  'avatar.thinking': ['O‘ylayapti…', 'Думает…', 'Thinking…', 'Düşünüyor…', 'Ойланып тұр…', 'Ойлонуп жатат…', 'Фикр мекунад…', 'Denkt nach…'],
  'chat.placeholder': ['Savolingizni yozing…', 'Напишите вопрос…', 'Type your question…', 'Sorunuzu yazın…', 'Сұрағыңызды жазыңыз…', 'Суроонуздү жазыңыз…', 'Саволатонро нависед…', 'Schreib deine Frage…'],
  'lessons.sub': ['Grammatika darslari — so‘zlar va mashqlar bilan — hamda tinglab-o‘qish uchun qisqa hikoyalar.', 'Уроки грамматики со словами и упражнениями и короткие истории для чтения и аудирования.', 'Grammar lessons with words and exercises, plus short stories to read and listen to.', 'Kelime ve alıştırmalı dilbilgisi dersleri ile dinleyip okumak için kısa hikâyeler.', 'Сөздер мен жаттығулары бар грамматика сабақтары және тыңдап оқуға арналған әңгімелер.', 'Сөздөр жана көнүгүүлөр менен грамматика сабактары жана угуп-окуу үчүн аңгемелер.', 'Дарсҳои грамматика бо калима ва машқҳо, инчунин ҳикояҳои кӯтоҳ барои гӯш кардан ва хондан.', 'Grammatiklektionen mit Wörtern und Übungen sowie kurze Geschichten zum Hören und Lesen.'],
  'lessons.tab1': ['Darslar', 'Уроки', 'Lessons', 'Dersler', 'Сабақтар', 'Сабактар', 'Дарсҳо', 'Lektionen'],
  'lessons.tab2': ['Tinglang va o‘qing', 'Слушайте и читайте', 'Listen & read', 'Dinle ve oku', 'Тыңда да оқы', 'Ук жана оку', 'Гӯш кунед ва хонед', 'Hören & Lesen'],
  'game.clouds': ['Bulutlar o‘yini', 'Игра «Облака»', 'Cloud game', 'Bulut oyunu', '«Бұлттар» ойыны', '«Булуттар» оюну', 'Бозии «Абрҳо»', 'Wolkenspiel'],
  'game.findUz': ['O‘zbekcha tarjimasini toping', 'Найдите перевод', 'Find the translation', 'Çevirisini bul', 'Аудармасын тап', 'Котормосун тап', 'Тарҷумаашро ёбед', 'Finde die Übersetzung'],
  'game.hint': ['Yordam', 'Подсказка', 'Hint', 'İpucu', 'Көмек', 'Жардам', 'Ёрӣ', 'Tipp'],
};

const Ctx = createContext({ lang: 'uz', setLang: () => {}, t: (k) => k });

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    const selected = new URLSearchParams(window.location.search).get('lang');
    if (ORDER.includes(selected)) return selected;
    try { return localStorage.getItem('optima-lang') || 'uz'; } catch { return 'uz'; }
  });
  const setLang = (l) => { setLangState(l); try { localStorage.setItem('optima-lang', l); } catch { /* */ } };
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const idx = Math.max(0, ORDER.indexOf(lang));
  const t = (key) => (T[key] ? T[key][idx] || T[key][0] : key);
  return <Ctx.Provider value={{ lang, setLang, t, langInfo: LANGS[idx] }}>{children}</Ctx.Provider>;
}

export const useT = () => useContext(Ctx);
