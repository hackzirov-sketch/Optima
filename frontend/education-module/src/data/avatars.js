/* Gapiradigan AI ustozlar: 2 erkak, 1 ayol. */
export const TUTORS = [
  {
    id: 'kamron', name: 'Kamron', gender: 'male', trait: 'Jasur', role: 'Ingliz tili ustozi',
    motto: 'Yangi suhbatlarga doim tayyor.', bg: '#DCE6FA', accent: '#2B4BE0', lang: 'en',
    hello: 'Salom! Men Kamronman. Keling, inglizcha gaplashamiz — xato qilishdan qo‘rqmang, men yumshoq to‘g‘rilab boraman.',
  },
  {
    id: 'sardor', name: 'Sardor', gender: 'male', trait: 'Bilimdon', role: 'Matematika ustozi',
    motto: 'Kichik qadamlar — katta maqsadlar.', bg: '#FBF0D2', accent: '#B86A00', lang: 'uz',
    hello: 'Assalomu alaykum! Men Sardorman. Qaysi masala qiynayapti? Javobini emas, yechish yo‘lini birga topamiz.',
  },
  {
    id: 'malika', name: 'Malika', gender: 'female', trait: 'Ijodkor', role: 'Suhbatdosh va IELTS speaking',
    motto: 'Har bir so‘zga rang qo‘shadi.', bg: '#F8DDEB', accent: '#C2407A', lang: 'uz',
    hello: 'Salom! Men Malikaman. Hikoya o‘qiymizmi, so‘z yodlaymizmi yoki IELTS speaking mashq qilamizmi?',
  },
];

export const tutorById = (id) => TUTORS.find((t) => t.id === id) || TUTORS[0];
