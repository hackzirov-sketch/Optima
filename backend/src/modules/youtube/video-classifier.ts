/**
 * Rule-based classification of YouTube videos for Optima — no LLM calls.
 *
 * Optima is a place to learn and to work, so the bar is "does this teach or
 * inform?". Keywords (Uzbek, Russian, English), the YouTube category, length
 * and tags each add or remove points; nothing decides alone, except a short
 * list of hard blocks (pranks, music videos, films, gaming…) that are never
 * shown. A video that ends up negative is rejected everywhere, search included.
 */

export type ContentType = 'tutorial' | 'lecture' | 'podcast' | 'documentary' | 'book_analysis' | 'interview' | 'explainer' | 'other';

export interface ClassifierInput {
  title: string;
  description?: string;
  tags?: string[];
  categoryId?: string | number | null;
  durationSeconds?: number;
  channelTitle?: string;
}

export interface Classification {
  /** Never shown (search included). */
  rejected: boolean;
  /** E — how educational, 0..100. */
  educational: number;
  contentType: ContentType;
  topics: string[];
  reasons: string[];
}

/** Lowercase, one apostrophe for Uzbek (o‘ o` oʻ → o'), single spaces. */
export function normalize(text: string): string {
  return text.toLowerCase().normalize('NFKC').replace(/[‘’`ʻʼ´]/g, "'").replace(/\s+/g, ' ');
}

/** Pranks, music, films, games… — off-topic for a work/learning space. */
const HARD_BLOCK = [
  'prank', 'пранк', 'mukbang', 'мукбанг', 'asmr', 'асмр', 'music video', 'official video', 'official audio', 'lyric video', 'клип',
  'klip', 'премьера клипа', 'trailer', 'трейлер', 'treyler', "o'zbek kino", 'ozbek kino', 'uzbek kino', 'узбек кино', 'узбекский фильм',
  'yangi kino', 'kino 20', 'фильм полностью', 'full movie', "o'zbek serial", 'turk serial', 'yangi serial', 'serial qism', 'сериал', 'tiktok', 'тикток', '#shorts', 'let\'s play',
  'gameplay', 'геймплей', 'прохождение', 'minecraft', 'pubg', 'fortnite', 'free fire', 'funny moments', 'смешные моменты', 'приколы', 'prikol',
  'челлендж', 'reaction to', 'реакция на', 'хайлайты', 'goal compilation', 'to\'y', 'свадьба', 'wedding',
  'horoscope', 'гороскоп', 'fol ochish', 'гадание', '18+', 'stand up', 'стендап', 'comedy show', 'юмор', 'hazil', 'qiziqchilar',
];

/** Weak negatives: they lower the score but a strong lesson can outweigh them. */
const SOFT_NEGATIVE: Array<[string, number]> = [
  ['comedy', 18], ['funny', 15], ['vlog', 12], ['влог', 12], ['reaction', 14], ['реакция', 14], ['gaming', 18], ['game', 6],
  ['entertainment', 10], ['shou', 10], ['шоу', 10], ['konsert', 20], ['концерт', 20], ['qo\'shiq', 20], ['песня', 20], ['song', 14],
  ['remix', 20], ['ремикс', 20], ['dance', 15], ['танец', 15], ['top 10', 6], ['shocking', 12], ['шок', 12], ['you won\'t believe', 15],
  ['challenge', 10], ['highlights', 14], ['scandal', 10], ['скандал', 10], ['janjal', 10], ['gossip', 12], ['сплетни', 12], ['unboxing', 8], ['распаковка', 8],
];

/** What teaching looks like, with weights. */
const POSITIVE: Array<[string, number]> = [
  ['tutorial', 14], ['туториал', 14], ['dars', 14], ['darslik', 14], ['урок', 14], ['lesson', 14], ['course', 12], ['kurs', 12], ['курс', 12],
  ['lecture', 16], ['лекция', 16], ["ma'ruza", 16], ['explained', 14], ['объяснение', 12], ['tushuntir', 12], ['how it works', 14],
  ['как это работает', 14], ['qanday ishlaydi', 14], ['deep dive', 14], ['case study', 14], ['кейс', 8], ['research', 10], ['исследован', 10],
  ['tadqiqot', 10], ['documentary', 12], ['документальный', 12], ['hujjatli', 12], ['interview', 8], ['интервью', 8], ['suhbat', 6],
  ['podcast', 8], ['подкаст', 8], ['podkast', 8], ['lessons learned', 12], ['book review', 12], ['обзор книги', 12], ['kitob tahlili', 12],
  ['kitob haqida', 10], ['guide', 8], ['руководство', 8], ["qo'llanma", 10], ['for beginners', 10], ['для начинающих', 10],
  ["boshlang'ich", 10], ['from scratch', 10], ['с нуля', 10], ['noldan', 10], ['masterclass', 12], ['мастер-класс', 12], ['webinar', 10],
  ['вебинар', 10], ['seminar', 8], ['семинар', 8], ['analysis', 8], ['анализ', 8], ['tahlil', 8], ['science', 8], ['наука', 8], ['ilm', 6],
  [' mit ', 10], ['harvard', 10], ['stanford', 10], ['cs50', 14], [' ted ', 6], ['tedx', 6], ['university', 8], ['университет', 8], ['universitet', 8],
  ['olimpiada', 10], ['dtm', 10], ['ielts', 12], ['cefr', 12], ['exam', 6], ['экзамен', 6], ['imtihon', 6], ['masala', 8],
  ['задач', 6], ['formula', 6], ['формул', 6], ['theory', 8], ['теори', 8], ['nazariya', 8], ['practice', 6], ['практик', 6], ['amaliy', 6],
];

/** Topic dictionaries — also the "R" (interests) axis. */
const TOPICS: Record<string, string[]> = {
  programming: ['programming', 'dasturlash', 'программирован', 'javascript', 'typescript', 'python', ' java ', 'golang', ' rust ', 'c++', 'react', 'node.js', 'nestjs', 'backend', 'frontend', 'sql', ' git ', 'docker', 'kubernetes', 'linux', 'algorithm', 'алгоритм', 'algoritm', 'coding', 'developer', 'разработ', 'dasturchi', ' api '],
  system_design: ['system design', 'системный дизайн', 'architecture', 'архитектур', 'arxitektura', 'distributed', 'распределен', 'microservice', 'микросервис', 'scalab', 'масштаб', 'database design', 'high load', 'highload'],
  ai_data: ['machine learning', 'машинное обучение', 'deep learning', 'neural', 'нейросет', 'neyron', 'artificial intelligence', 'искусственный интеллект', "sun'iy intellekt", ' ai ', 'llm', 'data science', 'statistics', 'статистик', 'statistika'],
  science: ['physics', 'физик', 'fizika', 'chemistry', 'хими', 'kimyo', 'biology', 'биолог', 'biologiya', 'astronomy', 'астроном', 'space', 'космос', 'koinot', 'science', 'наук', 'ilm-fan'],
  math: ['math', 'матем', 'matematika', 'algebra', 'алгебр', 'geometr', 'геометр', 'calculus', 'математическ', 'tenglama', 'уравнен'],
  business: ['business', 'бизнес', 'biznes', 'startup', 'стартап', 'marketing', 'маркетинг', 'finance', 'финанс', 'moliya', 'invest', 'инвест', 'sales', 'продаж', 'savdo', 'management', 'менеджмент', 'boshqaruv', 'economics', 'экономик', 'iqtisod', 'entrepreneur', 'tadbirkor', 'предпринимат'],
  psychology: ['psychology', 'психолог', 'psixolog', 'habits', 'привычк', 'odat', 'motivation', 'мотивац', 'motivatsiya', 'productivity', 'продуктивн', 'samaradorlik', 'mindset', 'мышлен', 'tafakkur', 'self-improvement', 'саморазвит'],
  books: ['book', 'книг', 'kitob', 'author', 'автор', 'muallif', 'literature', 'литератур', 'adabiyot', 'summary', 'краткое содержание', 'xulosa'],
  career: ['career', 'карьер', 'karyera', 'interview tips', 'собеседован', 'resume', 'резюме', 'rezyume', 'job', 'работа', ' ish ', 'freelanc', 'фриланс', 'frilans', 'salary', 'зарплат', 'maosh'],
  languages: ['english', 'английск', 'ingliz', 'ielts', 'grammar', 'граммати', 'grammatika', 'vocabulary', 'лексик', "so'z boyligi", 'russian language', 'rus tili', 'korean', 'koreys', 'german', 'nemis', 'turkish', 'turk tili', 'arab tili'],
  history: ['history', 'истори', 'tarix', 'civilization', 'цивилизац', 'sivilizatsiya', 'empire', 'импери', 'imperiya', ' war ', 'война', 'urush'],
  technology: ['technology', 'технолог', 'texnologiya', 'gadget', 'гаджет', 'internet', 'интернет', 'cybersecurity', 'кибербез', 'kiberxavfsizlik', 'blockchain', 'блокчейн', 'cloud', 'облак'],
  health: ['health', 'здоровь', "sog'liq", 'nutrition', 'питани', 'ovqatlanish', 'medicine', 'медицин', 'tibbiyot', 'sleep', 'uyqu', 'fitness', 'фитнес'],
};

/** YouTube category ids → points. Music and trailers are rejected outright. */
const CATEGORY_POINTS: Record<string, number> = {
  '27': 30, // Education
  '28': 24, // Science & Technology
  '26': 12, // Howto & Style
  '25': 4, // News & Politics
  '29': 4, // Nonprofits & Activism
  '22': 0, // People & Blogs
  '19': -6, // Travel & Events
  '2': -10, // Autos & Vehicles
  '15': -22, // Pets & Animals
  '17': -22, // Sports
  '24': -16, // Entertainment
  '1': -28, // Film & Animation
  '23': -36, // Comedy
  '20': -40, // Gaming
  '43': -30, // Shows
};
const REJECTED_CATEGORIES = new Set(['10', '44', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', '41', '42']); // music, trailers, movie categories

const has = (text: string, word: string) => text.includes(word);

export function classifyVideo(input: ClassifierInput): Classification {
  const title = normalize(input.title ?? '');
  const description = normalize((input.description ?? '').slice(0, 1500));
  const tags = normalize((input.tags ?? []).slice(0, 30).join(' | '));
  const head = ` ${title} | ${tags} `; // title + tags: what the video says it is
  const reasons: string[] = [];
  const category = input.categoryId == null ? '' : String(input.categoryId);
  const duration = Number(input.durationSeconds) || 0;

  // ── score ──
  let score = 32;
  const categoryPoints = CATEGORY_POINTS[category] ?? 0;
  score += categoryPoints;
  if (categoryPoints) reasons.push(`category ${category} ${categoryPoints > 0 ? '+' : ''}${categoryPoints}`);

  let positive = 0;
  for (const [word, weight] of POSITIVE) {
    if (has(head, word)) positive += weight;
    else if (has(description, word)) positive += weight / 3;
  }
  positive = Math.min(positive, 42);
  score += positive;
  if (positive) reasons.push(`teaching words +${Math.round(positive)}`);

  let soft = 0;
  for (const [word, weight] of SOFT_NEGATIVE) if (has(head, word)) soft += weight;
  soft = Math.min(soft, 40);
  score -= soft;
  if (soft) reasons.push(`entertainment words -${soft}`);

  const topics = Object.entries(TOPICS)
    .map(([topic, words]) => [topic, words.reduce((n, word) => n + (has(head, word) ? 2 : has(description, word) ? 1 : 0), 0)] as const)
    .filter(([, hits]) => hits > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([topic]) => topic);
  if (topics.length) { score += 8; reasons.push(`topics ${topics.join(',')}`); }

  // Length: shorts don't teach much; 8–90 minutes is the sweet spot.
  if (duration > 0) {
    if (duration < 90) { score -= 25; reasons.push('short clip -25'); }
    else if (duration < 240) score -= 8;
    else if (duration >= 480 && duration <= 5400) score += 6;
  }

  // Clickbait: shouting titles.
  const letters = (input.title ?? '').replace(/[^\p{L}]/gu, '');
  const upper = (input.title ?? '').replace(/[^\p{Lu}]/gu, '');
  if (letters.length > 12 && upper.length / letters.length > 0.6) { score -= 10; reasons.push('all caps -10'); }
  if (/[!?]{3,}/.test(input.title ?? '')) { score -= 6; reasons.push('!!! -6'); }

  const educational = Math.max(0, Math.min(100, Math.round(score)));

  // ── content type ──
  // "Interview" means a conversation — not job-interview prep ("system design interview", "coding interview").
  const jobInterview = /(system design|coding|technical|job|tech|behavioral|google|amazon|faang)\s+interview|interview (prep|questions|tips|guide)|собеседован/.test(head);
  const contentType: ContentType =
    /podcast|подкаст|podkast/.test(head) ? 'podcast'
      : !jobInterview && /interview with|interview:|интервью с|intervyu|bilan suhbat|in conversation/.test(head) ? 'interview'
        : /documentary|документальн|hujjatli/.test(head) ? 'documentary'
          : /book review|обзор книги|kitob tahlili|kitob haqida|book summary|краткое содержание/.test(head) ? 'book_analysis'
            : /lecture|лекция|ma'ruza|cs50|university|университет/.test(head) ? 'lecture'
              : /tutorial|туториал|dars|урок|lesson|course|kurs|курс|guide|qo'llanma|from scratch|с нуля|noldan/.test(head) ? 'tutorial'
                : /explained|объяснен|tushuntir|how it works|как это работает|qanday ishlaydi|deep dive|analysis|tahlil/.test(head) ? 'explainer'
                  : 'other';

  // ── verdict ──
  let rejected = false;
  const blocked = HARD_BLOCK.find((word) => has(head, word));
  if (REJECTED_CATEGORIES.has(category)) { rejected = true; reasons.push(`category ${category} rejected`); }
  // A hard-blocked word in the title/tags rejects — unless the video is plainly
  // a lesson *about* it ("psychology of comedy", "how trailers are edited").
  if (blocked && !(positive >= 24 && topics.length > 0)) { rejected = true; reasons.push(`blocked "${blocked}"`); }
  if (duration > 0 && duration < 61) { rejected = true; reasons.push('youtube short'); }
  if (educational < 40) { rejected = true; reasons.push(`educational ${educational} < 40`); }

  return { rejected, educational, contentType, topics, reasons };
}
