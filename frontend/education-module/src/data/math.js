/*
 * Matematika 1–11-sinf: darslik mundarijasi (bo'limlar), qisqa nazariya,
 * formula, yechilgan misol va cheksiz mashq generatorlari.
 * Rasmiy darslik matnini qo'shish uchun har bir bo'limga `pdf` maydoni bor.
 */

const r = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const frac = (n, d) => { const g = gcd(n, d); const s = d / g < 0 ? -1 : 1; return d / g * s === 1 ? String(n / g * s) : `${n / g * s}/${d / g * s}`; };

/* Har bir generator { q, a, hint } qaytaradi. a — to'g'ri javob(lar) massivi. */
export const GEN = {
  add10: () => { const a = r(1, 9), b = r(1, 10 - a); return { q: `${a} + ${b} = ?`, a: [a + b], hint: 'Barmoqlar bilan sanab ko‘ring.' }; },
  add20: () => { const a = r(5, 15), b = r(2, 20 - a); return { q: `${a} + ${b} = ?`, a: [a + b], hint: 'Avval 10 gacha to‘ldiring.' }; },
  sub20: () => { const a = r(8, 20), b = r(1, a); return { q: `${a} − ${b} = ?`, a: [a - b], hint: 'Kattadan kichikni ayiring.' }; },
  add100: () => { const a = r(10, 89), b = r(5, 99 - a); return { q: `${a} + ${b} = ?`, a: [a + b], hint: 'Avval o‘nliklarni, keyin birliklarni qo‘shing.' }; },
  sub100: () => { const a = r(30, 99), b = r(5, a - 5); return { q: `${a} − ${b} = ?`, a: [a - b], hint: 'O‘nliklar va birliklarni alohida ayiring.' }; },
  mul: () => { const a = r(2, 9), b = r(2, 9); return { q: `${a} × ${b} = ?`, a: [a * b], hint: `${a} ni ${b} marta qo‘shing.` }; },
  div: () => { const b = r(2, 9), c = r(2, 9); return { q: `${b * c} : ${b} = ?`, a: [c], hint: `${b} ni nechaga ko‘paytirsak ${b * c} bo‘ladi?` }; },
  add1000: () => { const a = r(100, 600), b = r(100, 399); return { q: `${a} + ${b} = ?`, a: [a + b], hint: 'Ustun shaklida yozib qo‘shing.' }; },
  mulBig: () => { const a = r(12, 99), b = r(3, 9); return { q: `${a} × ${b} = ?`, a: [a * b], hint: `${a} = ${Math.floor(a / 10) * 10} + ${a % 10}; har birini ${b} ga ko‘paytiring.` }; },
  perimeter: () => { const a = r(2, 15), b = r(2, 15); return { q: `To‘g‘ri to‘rtburchak tomonlari ${a} sm va ${b} sm. Perimetri necha sm?`, a: [2 * (a + b)], hint: 'P = 2 · (a + b).' }; },
  area: () => { const a = r(2, 15), b = r(2, 15); return { q: `To‘g‘ri to‘rtburchak tomonlari ${a} sm va ${b} sm. Yuzasi necha sm²?`, a: [a * b], hint: 'S = a · b.' }; },
  speed: () => { const v = r(3, 12) * 5, t = r(2, 6); return { q: `Mashina soatiga ${v} km tezlikda ${t} soat yurdi. Necha km yo‘l bosdi?`, a: [v * t], hint: 's = v · t.' }; },
  fracSame: () => { const d = r(5, 12), a = r(1, d - 2), b = r(1, d - a - 1); return { q: `${a}/${d} + ${b}/${d} = ?`, a: [frac(a + b, d)], hint: 'Maxrajlar bir xil — suratlarni qo‘shing.' }; },
  fracDiff: () => { const p = pick([[2, 3], [2, 5], [3, 4], [4, 5], [3, 5], [2, 7]]); const a = r(1, p[0] - 1) || 1, b = r(1, p[1] - 1) || 1; return { q: `${a}/${p[0]} + ${b}/${p[1]} = ?`, a: [frac(a * p[1] + b * p[0], p[0] * p[1])], hint: `Umumiy maxraj: ${p[0] * p[1]}.` }; },
  decimal: () => { const a = r(11, 99) / 10, b = r(11, 99) / 10; return { q: `${a} + ${b} = ?`, a: [Math.round((a + b) * 10) / 10], hint: 'Vergulni vergul tagiga yozing.' }; },
  percent: () => { const p = pick([10, 20, 25, 50, 75]), n = r(2, 20) * 20; return { q: `${n} ning ${p}% i nechaga teng?`, a: [n * p / 100], hint: `${p}% = ${p}/100.` }; },
  negative: () => { const a = r(-15, 15), b = r(-15, 15); return { q: `(${a}) + (${b}) = ?`, a: [a + b], hint: 'Ishoralar har xil bo‘lsa — ayiring va kattasining ishorasini qo‘ying.' }; },
  proportion: () => { const a = r(2, 9), b = r(2, 9), k = r(2, 6); return { q: `${a} : ${b} = ${a * k} : x. x = ?`, a: [b * k], hint: 'Proporsiyaning asosiy xossasi: chetki hadlar ko‘paytmasi = o‘rta hadlar ko‘paytmasi.' }; },
  angleTri: () => { const a = r(30, 80), b = r(30, 80); return { q: `Uchburchakning ikki burchagi ${a}° va ${b}°. Uchinchi burchak necha gradus?`, a: [180 - a - b], hint: 'Uchburchak burchaklari yig‘indisi 180°.' }; },
  linear: () => { const x = r(-9, 12), a = r(2, 9), b = r(-20, 20); return { q: `${a}x ${b < 0 ? '−' : '+'} ${Math.abs(b)} = ${a * x + b}. x = ?`, a: [x], hint: `Avval ${b < 0 ? '+' : '−'}${Math.abs(b)} ni o‘ng tomonga o‘tkazing, keyin ${a} ga bo‘ling.` }; },
  power: () => { const a = r(2, 9), n = pick([2, 3]); return { q: `${a}${n === 2 ? '²' : '³'} = ?`, a: [a ** n], hint: `${a} ni o‘ziga ${n} marta ko‘paytiring.` }; },
  expand: () => { const a = r(1, 9), b = r(1, 9); return { q: `(x + ${a})(x + ${b}) ifodani ochganda x oldidagi koeffitsient nechaga teng?`, a: [a + b], hint: '(x + a)(x + b) = x² + (a + b)x + ab.' }; },
  sqrt: () => { const a = r(2, 20); return { q: `√${a * a} = ?`, a: [a], hint: 'Qaysi son o‘ziga ko‘paytirilsa shu son chiqadi?' }; },
  pythag: () => { const t = pick([[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [9, 12, 15]]); return { q: `To‘g‘ri burchakli uchburchak katetlari ${t[0]} va ${t[1]}. Gipotenuza = ?`, a: [t[2]], hint: 'c² = a² + b².' }; },
  quadSum: () => { const x1 = r(-6, 8), x2 = r(-6, 8); const b = -(x1 + x2), c = x1 * x2; return { q: `x² ${b < 0 ? '−' : '+'} ${Math.abs(b)}x ${c < 0 ? '−' : '+'} ${Math.abs(c)} = 0. Ildizlar yig‘indisi = ?`, a: [x1 + x2], hint: 'Viyet teoremasi: x₁ + x₂ = −b.' }; },
  quadRoot: () => { const x1 = r(1, 9), x2 = r(-9, -1); const b = -(x1 + x2), c = x1 * x2; return { q: `x² ${b < 0 ? '−' : '+'} ${Math.abs(b)}x − ${Math.abs(c)} = 0. Musbat ildizni toping.`, a: [x1], hint: 'D = b² − 4ac, x = (−b ± √D) / 2.' }; },
  arith: () => { const a = r(1, 10), d = r(2, 7), n = r(5, 15); return { q: `Arifmetik progressiya: a₁ = ${a}, d = ${d}. a${toSub(n)} = ?`, a: [a + (n - 1) * d], hint: 'aₙ = a₁ + (n − 1)d.' }; },
  geom: () => { const b = r(1, 4), q = pick([2, 3]), n = r(3, 6); return { q: `Geometrik progressiya: b₁ = ${b}, q = ${q}. b${toSub(n)} = ?`, a: [b * q ** (n - 1)], hint: 'bₙ = b₁ · qⁿ⁻¹.' }; },
  trig: () => { const t = pick([['sin 30°', 0.5], ['cos 60°', 0.5], ['tg 45°', 1], ['sin 90°', 1], ['cos 0°', 1], ['sin 0°', 0], ['cos 90°', 0]]); return { q: `${t[0]} = ?`, a: [t[1]], hint: 'Birlik aylanadan foydalaning.' }; },
  logs: () => { const b = pick([2, 3, 5, 10]), n = r(1, b === 10 ? 4 : 5); return { q: `log${toSub(b)} ${b ** n} = ?`, a: [n], hint: `${b} ni qaysi darajaga ko‘tarsak ${b ** n} bo‘ladi?` }; },
  deriv: () => { const a = r(1, 6), n = r(2, 4), x = r(1, 3); return { q: `f(x) = ${a === 1 ? '' : a}x${sup(n)} bo‘lsa, f′(${x}) = ?`, a: [a * n * x ** (n - 1)], hint: '(xⁿ)′ = n · xⁿ⁻¹.' }; },
  integral: () => { const n = r(1, 3), b = r(1, 3); return { q: `∫₀${sup(b, true)} ${n + 1 === 1 ? '' : n + 1}x${n === 1 ? '' : sup(n)} dx = ?`, a: [b ** (n + 1)], hint: '∫xⁿdx = xⁿ⁺¹/(n+1).' }; },
  prob: () => { const k = r(1, 5); return { q: `Zar tashlanganda ${k} dan katta son tushish ehtimoli? (kasr ko‘rinishida)`, a: [frac(6 - k, 6)], hint: 'Qulay hollar / barcha hollar (6).' }; },
  circle: () => { const rr = r(2, 10); return { q: `Radiusi ${rr} sm bo‘lgan doira yuzasi? (π = 3,14)`, a: [Math.round(3.14 * rr * rr * 100) / 100], hint: 'S = πr².' }; },
  mean: () => { const xs = [r(2, 10), r(2, 10), r(2, 10), r(2, 10)]; const s = xs.reduce((a, b) => a + b, 0); const fix = (4 - (s % 4)) % 4; xs[0] += fix; return { q: `${xs.join(', ')} sonlarining o‘rta arifmetigi = ?`, a: [(s + fix) / 4], hint: 'Yig‘indini sonlar soniga bo‘ling.' }; },
  volume: () => { const a = r(2, 9), b = r(2, 9), c = r(2, 9); return { q: `To‘g‘ri burchakli parallelepiped o‘lchamlari ${a}, ${b}, ${c}. Hajmi = ?`, a: [a * b * c], hint: 'V = a · b · c.' }; },
};

function toSub(n) { return String(n).split('').map((d) => '₀₁₂₃₄₅₆₇₈₉'[d]).join(''); }
function sup(n) { return String(n).split('').map((d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]).join(''); }

/** Javobni tekshirish: son, kasr (a/b) va vergulli sonlarni tushunadi. */
export function checkAnswer(input, answers) {
  const s = String(input).trim().replace(',', '.').replace(/\s+/g, '').replace('−', '-');
  return answers.some((a) => {
    const t = String(a);
    if (s === t) return true;
    const toNum = (v) => (v.includes('/') ? Number(v.split('/')[0]) / Number(v.split('/')[1]) : Number(v));
    const x = toNum(s), y = toNum(t);
    return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 1e-6;
  });
}

/* c(nomi, nazariya, formula, misol, generatorlar) */
const c = (title, theory, formula, example, gens) => ({ title, theory, formula, example, gens });

export const GRADES = {
  1: [
    c('1 dan 10 gacha sonlar', 'Sonlarni sanash, yozish va solishtirish. Har bir son oldingisidan bittaga katta.', '1 < 2 < 3 < … < 10', '7 dan keyin 8 keladi.', ['add10']),
    c('10 ichida qo‘shish', 'Qo‘shish — ikki to‘pni birlashtirish. Natija “yig‘indi” deyiladi.', 'a + b = yig‘indi', '3 + 4 = 7', ['add10']),
    c('10 ichida ayirish', 'Ayirish — bir qismini olib qo‘yish. Natija “ayirma” deyiladi.', 'a − b = ayirma', '9 − 5 = 4', ['sub20']),
    c('20 ichida qo‘shish va ayirish', 'O‘ndan o‘tib qo‘shishda avval 10 gacha to‘ldiriladi: 8 + 5 = 8 + 2 + 3.', '8 + 5 = 10 + 3', '8 + 5 = 13', ['add20', 'sub20']),
    c('Geometrik shakllar', 'Doira, uchburchak, kvadrat va to‘g‘ri to‘rtburchakni farqlash. Kvadratning 4 tomoni teng.', '△ ○ □', 'Uchburchakning 3 ta burchagi bor.', ['add10']),
    c('Uzunlik: santimetr', 'Uzunlik chizg‘ich bilan santimetrlarda o‘lchanadi.', '1 dm = 10 sm', '6 sm + 3 sm = 9 sm', ['add20']),
  ],
  2: [
    c('100 gacha sonlar', 'Ikki xonali sonlar o‘nliklar va birliklardan iborat: 47 = 4 o‘nlik + 7 birlik.', '47 = 40 + 7', '58 da 5 o‘nlik bor.', ['add100']),
    c('100 ichida qo‘shish', 'Avval o‘nliklar, keyin birliklar qo‘shiladi.', '34 + 25 = (30+20) + (4+5)', '34 + 25 = 59', ['add100']),
    c('100 ichida ayirish', 'O‘nliklar va birliklar alohida ayiriladi; kerak bo‘lsa bitta o‘nlik “qarzga” olinadi.', '72 − 38 = 34', '72 − 38 = 34', ['sub100']),
    c('Ko‘paytirish ma’nosi', 'Ko‘paytirish — bir xil sonlarni qo‘shishning qisqa yozuvi.', '3 + 3 + 3 + 3 = 3 × 4', '3 × 4 = 12', ['mul']),
    c('Bo‘lish ma’nosi', 'Bo‘lish — teng qismlarga ajratish. Ko‘paytirishga teskari amal.', '12 : 3 = 4, chunki 3 × 4 = 12', '12 : 3 = 4', ['div']),
    c('Vaqt: soat va daqiqa', '1 soat = 60 daqiqa. Soat millari: kichigi soatni, kattasi daqiqani ko‘rsatadi.', '1 soat = 60 daq', '2 soat = 120 daqiqa', ['add100']),
  ],
  3: [
    c('Ko‘paytirish jadvali', '2 dan 9 gacha ko‘paytirish jadvalini yoddan bilish.', 'a × b = b × a', '7 × 8 = 56', ['mul']),
    c('Jadval bo‘yicha bo‘lish', 'Ko‘paytirish jadvalidan bo‘lishni topish.', 'a × b = c ⇒ c : a = b', '56 : 7 = 8', ['div']),
    c('1000 gacha sonlar', 'Uch xonali sonlar: yuzliklar, o‘nliklar, birliklar.', '365 = 300 + 60 + 5', '365 da 3 yuzlik bor.', ['add1000']),
    c('Ustun shaklida qo‘shish', 'Sonlar xona birliklari ustma-ust tushadigan qilib yoziladi.', 'xona ostida xona', '256 + 318 = 574', ['add1000']),
    c('Perimetr', 'Perimetr — shakl barcha tomonlari uzunliklari yig‘indisi.', 'P = 2 · (a + b)', 'a = 5, b = 3 ⇒ P = 16', ['perimeter']),
    c('Kasrlar bilan tanishuv', 'Butunni teng bo‘laklarga bo‘lsak, bitta bo‘lak — kasr: yarim = 1/2, chorak = 1/4.', '1/2, 1/3, 1/4', 'Olmaning yarmi — 1/2.', ['fracSame']),
  ],
  4: [
    c('Ko‘p xonali sonlar', 'Million gacha sonlarni o‘qish va yozish; sinflar: birlar, minglar.', '25 340 = 25 ming 340', '1 000 000 — million', ['add1000']),
    c('Ko‘p xonali songa ko‘paytirish', 'Ikki xonali sonni bir xonaliga ko‘paytirish xonalar bo‘yicha bajariladi.', '23 × 4 = 20×4 + 3×4', '23 × 4 = 92', ['mulBig']),
    c('Yuza', 'Yuza — shakl egallagan tekislik o‘lchami; sm² larda o‘lchanadi.', 'S = a · b', 'a = 6, b = 4 ⇒ S = 24 sm²', ['area']),
    c('Tezlik, vaqt, masofa', 'Masofa tezlik bilan vaqt ko‘paytmasiga teng.', 's = v · t', 'v = 60 km/soat, t = 3 ⇒ s = 180 km', ['speed']),
    c('Oddiy tenglamalar', 'Noma’lum sonni topish: x + 5 = 12 ⇒ x = 12 − 5.', 'x + a = b ⇒ x = b − a', 'x + 5 = 12 ⇒ x = 7', ['linear']),
    c('Kasrlar', 'Bir xil maxrajli kasrlarni qo‘shish va solishtirish.', 'a/c + b/c = (a+b)/c', '2/7 + 3/7 = 5/7', ['fracSame']),
  ],
  5: [
    c('Natural sonlar va amallar', 'Amallar tartibi: avval qavs, keyin ko‘paytirish/bo‘lish, so‘ng qo‘shish/ayirish.', '2 + 3 × 4 = 14', '(2 + 3) × 4 = 20', ['mulBig', 'add1000']),
    c('Oddiy kasrlar', 'Kasr: surat/maxraj. Qisqartirish — surat va maxrajni bir xil songa bo‘lish.', 'a/b = (a·k)/(b·k)', '6/8 = 3/4', ['fracSame']),
    c('O‘nli kasrlar', 'Maxraji 10, 100, … bo‘lgan kasrlar vergul bilan yoziladi: 3/10 = 0,3.', '0,3 + 0,25 = 0,55', '2,4 + 1,7 = 4,1', ['decimal']),
    c('Burchaklar', 'To‘g‘ri burchak 90°, yoyiq burchak 180°. Burchaklar transportir bilan o‘lchanadi.', 'to‘g‘ri = 90°, yoyiq = 180°', '30° + 60° = 90°', ['angleTri']),
    c('Foizlar bilan tanishuv', '1% — sonning yuzdan bir qismi.', 'p% · n = n · p / 100', '200 ning 25% i = 50', ['percent']),
    c('Hajm', 'To‘g‘ri burchakli parallelepiped hajmi uch o‘lchami ko‘paytmasiga teng.', 'V = a · b · c', '2 · 3 · 4 = 24', ['volume']),
  ],
  6: [
    c('Bo‘linish belgilari va EKUB', '2 ga: oxirgi raqam juft; 3 ga: raqamlar yig‘indisi 3 ga bo‘linadi; 5 ga: 0 yoki 5 bilan tugaydi.', 'EKUB(12, 18) = 6', '18 ning raqamlari yig‘indisi 9 ⇒ 3 ga bo‘linadi', ['div']),
    c('Turli maxrajli kasrlar', 'Kasrlarni umumiy maxrajga keltirib qo‘shiladi.', 'a/b + c/d = (ad + cb)/bd', '1/2 + 1/3 = 5/6', ['fracDiff']),
    c('Nisbat va proporsiya', 'Proporsiya — ikki nisbatning tengligi. Chetki hadlar ko‘paytmasi o‘rta hadlar ko‘paytmasiga teng.', 'a : b = c : d ⇒ ad = bc', '2 : 3 = 4 : x ⇒ x = 6', ['proportion']),
    c('Musbat va manfiy sonlar', 'Son o‘qida noldan chapdagi sonlar manfiy. Qarama-qarshi sonlar yig‘indisi 0.', '(−a) + a = 0', '(−7) + 4 = −3', ['negative']),
    c('Foizlar', 'Foizni topish va son foizi bo‘yicha sonni topish.', 'n · p / 100', '400 ning 75% i = 300', ['percent']),
    c('Doira va aylana', 'Aylana uzunligi C = 2πr, doira yuzi S = πr². π ≈ 3,14.', 'S = πr²', 'r = 2 ⇒ S ≈ 12,56', ['circle']),
  ],
  7: [
    c('Algebraik ifodalar', 'Harfli ifodalarning qiymatini topish va soddalashtirish.', '3a + 2a = 5a', 'a = 4 ⇒ 3a + 1 = 13', ['linear']),
    c('Chiziqli tenglamalar', 'ax + b = c ko‘rinishidagi tenglamalar.', 'x = (c − b) / a', '2x + 3 = 11 ⇒ x = 4', ['linear']),
    c('Daraja', 'aⁿ — a sonini n marta o‘ziga ko‘paytirish.', 'aᵐ · aⁿ = aᵐ⁺ⁿ', '2³ = 8', ['power']),
    c('Ko‘phadlar va qisqa ko‘paytirish', '(a + b)² = a² + 2ab + b², (a − b)(a + b) = a² − b².', '(x + a)(x + b) = x² + (a+b)x + ab', '(x + 2)(x + 3) = x² + 5x + 6', ['expand']),
    c('Uchburchaklar', 'Uchburchak ichki burchaklari yig‘indisi 180°. Teng yonli uchburchakda asosdagi burchaklar teng.', 'α + β + γ = 180°', '50° + 60° + 70° = 180°', ['angleTri']),
    c('Chiziqli funksiya', 'y = kx + b — grafigi to‘g‘ri chiziq. k — burchak koeffitsienti.', 'y = kx + b', 'y = 2x + 1, x = 3 ⇒ y = 7', ['linear']),
  ],
  8: [
    c('Kvadrat ildiz', '√a — kvadrati a ga teng bo‘lgan manfiy bo‘lmagan son.', '√(a²) = |a|', '√81 = 9', ['sqrt']),
    c('Pifagor teoremasi', 'To‘g‘ri burchakli uchburchakda gipotenuza kvadrati katetlar kvadratlari yig‘indisiga teng.', 'c² = a² + b²', '3, 4 ⇒ c = 5', ['pythag']),
    c('Kvadrat tenglamalar', 'ax² + bx + c = 0. Diskriminant D = b² − 4ac.', 'x = (−b ± √D) / 2a', 'x² − 5x + 6 = 0 ⇒ 2; 3', ['quadRoot']),
    c('Viyet teoremasi', 'Keltirilgan kvadrat tenglamada ildizlar yig‘indisi −b, ko‘paytmasi c.', 'x₁ + x₂ = −b, x₁x₂ = c', 'x² − 7x + 10 = 0 ⇒ 2 + 5 = 7', ['quadSum']),
    c('Ratsional ifodalar', 'Kasr-ratsional ifodalarni qisqartirish va amallar.', '(a² − b²)/(a − b) = a + b', '(x² − 9)/(x − 3) = x + 3', ['fracDiff']),
    c('To‘rtburchaklar yuzi', 'Parallelogramm S = a·h, trapetsiya S = (a + b)/2 · h.', 'S = a · h', 'a = 6, h = 4 ⇒ 24', ['area']),
  ],
  9: [
    c('Kvadrat tenglamalar (takror)', 'Diskriminant va Viyet teoremasi yordamida yechish.', 'D = b² − 4ac', 'x² + x − 6 = 0 ⇒ 2; −3', ['quadRoot', 'quadSum']),
    c('Tengsizliklar', 'Tengsizlikni manfiy songa ko‘paytirsak, belgisi teskarisiga o‘zgaradi.', '−2x < 6 ⇒ x > −3', '3x − 1 > 8 ⇒ x > 3', ['linear']),
    c('Arifmetik progressiya', 'Har bir had oldingisiga bir xil d sonini qo‘shishdan hosil bo‘ladi.', 'aₙ = a₁ + (n − 1)d', 'a₁ = 2, d = 3 ⇒ a₁₀ = 29', ['arith']),
    c('Geometrik progressiya', 'Har bir had oldingisini bir xil q soniga ko‘paytirishdan hosil bo‘ladi.', 'bₙ = b₁ · qⁿ⁻¹', 'b₁ = 3, q = 2 ⇒ b₄ = 24', ['geom']),
    c('O‘xshash shakllar', 'O‘xshash shakllarda mos tomonlar proporsional, yuzalar nisbati k² ga teng.', 'S₁/S₂ = k²', 'k = 3 ⇒ yuzalar 9 marta farq qiladi', ['proportion']),
    c('Statistika asoslari', 'O‘rta arifmetik, moda, mediana.', 'x̄ = (x₁ + … + xₙ)/n', '2, 4, 6, 8 ⇒ 5', ['mean']),
  ],
  10: [
    c('Trigonometrik funksiyalar', 'Birlik aylanada sin — y koordinata, cos — x koordinata.', 'sin²α + cos²α = 1', 'sin 30° = 1/2', ['trig']),
    c('Funksiya xossalari', 'Aniqlanish sohasi, qiymatlar to‘plami, juft-toqlik, monotonlik.', 'f(−x) = f(x) — juft', 'f(x) = x² — juft funksiya', ['power']),
    c('Darajali va ko‘rsatkichli funksiyalar', 'y = aˣ, a > 0. Daraja xossalari.', 'aˣ · aʸ = aˣ⁺ʸ', '2⁵ = 32', ['power', 'geom']),
    c('Logarifm', 'logₐb — a ni qaysi darajaga ko‘tarsak b chiqadi.', 'logₐb = c ⇔ aᶜ = b', 'log₂ 8 = 3', ['logs']),
    c('Vektorlar', 'Vektor uzunligi |a| = √(x² + y²).', '|a| = √(x² + y²)', 'a(3; 4) ⇒ |a| = 5', ['pythag']),
    c('Ko‘pyoqlar', 'Prizma, piramida. Hajm formulalari.', 'V(prizma) = S·h', '2·3·4 = 24', ['volume']),
  ],
  11: [
    c('Hosila', 'Hosila — funksiya o‘zgarish tezligi.', '(xⁿ)′ = n · xⁿ⁻¹', 'f(x) = x³ ⇒ f′(2) = 12', ['deriv']),
    c('Hosilaning tatbiqi', 'Ekstremumlar: f′(x) = 0 nuqtalarda. Urinma tenglamasi.', 'y = f(x₀) + f′(x₀)(x − x₀)', 'f(x) = x² ⇒ f′(1) = 2', ['deriv']),
    c('Boshlang‘ich funksiya va integral', 'Integral — hosilaga teskari amal; aniq integral — yuza.', '∫xⁿdx = xⁿ⁺¹/(n+1) + C', '∫₀² 2x dx = 4', ['integral']),
    c('Ehtimollar nazariyasi', 'Hodisa ehtimoli = qulay hollar soni / barcha hollar soni.', 'P(A) = m / n', 'Zarda juft son: 3/6 = 1/2', ['prob']),
    c('Aylanish jismlari', 'Silindr V = πr²h, konus V = πr²h/3, shar V = 4πr³/3.', 'V = πr²h', 'r = 1, h = 2 ⇒ V ≈ 6,28', ['circle']),
    c('Takrorlash: DTMga tayyorlov', 'Barcha mavzular bo‘yicha aralash misollar.', '—', 'Aralash testlar', ['quadSum', 'logs', 'deriv', 'percent', 'pythag']),
  ],
};

export function makeProblems(chapter, n = 5) {
  return Array.from({ length: n }, () => GEN[pick(chapter.gens)]());
}

export const totalChapters = Object.values(GRADES).reduce((s, g) => s + g.length, 0);
