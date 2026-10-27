/*
 * "Tinglang va o'qing" — qisqa hikoyalar.
 * art — muqova rasmi turi (components/StoryArt.jsx), color — kartochka rangi.
 */
export const STORIES = [
  {
    id: 'my-day', title: 'My Day', uz: 'Mening kunim', level: 'A1', art: 'sunrise', color: '#5B4BC4',
    blurb: 'Sardorning oddiy, lekin qiziqarli kuni.',
    paras: [
      ['Sardor gets up at seven o’clock. He washes his face and eats breakfast with his family. His mother makes tea and bread.', 'Sardor soat yettida turadi. U yuzini yuvadi va oilasi bilan nonushta qiladi. Onasi choy va non tayyorlaydi.'],
      ['He goes to school by bus. His first lesson is English. He likes it because the teacher is kind and the lessons are fun.', 'U maktabga avtobusda boradi. Birinchi darsi — ingliz tili. U bu darsni yoqtiradi, chunki o‘qituvchi mehribon va darslar qiziqarli.'],
      ['In the evening, Sardor does his homework. Then he plays chess with his grandfather. He goes to bed at ten.', 'Kechqurun Sardor uy vazifasini bajaradi. Keyin bobosi bilan shaxmat o‘ynaydi. U soat o‘nda uxlashga yotadi.'],
    ],
    words: ['get up', 'breakfast', 'kind', 'homework', 'chess'],
    questions: [
      { q: 'When does Sardor get up?', opts: ['At six o’clock', 'At seven o’clock', 'At ten o’clock'], a: 1, why: 'Birinchi xatboshida: “gets up at seven o’clock”.' },
      { q: 'How does he go to school?', opts: ['By bus', 'On foot', 'By car'], a: 0, why: '“He goes to school by bus.”' },
      { q: 'Who does he play chess with?', opts: ['His father', 'His friend', 'His grandfather'], a: 2, why: 'Oxirgi xatboshi: “with his grandfather”.' },
    ],
  },
  {
    id: 'my-family', title: 'My Family', uz: 'Mening oilam', level: 'A1', art: 'family', color: '#C26A0A',
    blurb: 'Malika oilasini tanishtiradi.',
    paras: [
      ['My name is Malika. I am eleven years old. I live in Bukhara with my family. There are five people in my family.', 'Mening ismim Malika. Men o‘n bir yoshdaman. Buxoroda oilam bilan yashayman. Oilamizda besh kishi bor.'],
      ['My father is an engineer and my mother is a nurse. They work hard, but every Friday we have dinner together.', 'Otam muhandis, onam hamshira. Ular ko‘p ishlaydi, lekin har juma kechki ovqatni birga yeymiz.'],
      ['I have a brother and a sister. My brother is older than me. My little sister is four, and she loves cats.', 'Mening bir akam va bir singlim bor. Akam mendan katta. Singlim to‘rt yoshda va u mushuklarni juda yaxshi ko‘radi.'],
    ],
    words: ['family', 'engineer', 'nurse', 'together', 'sister'],
    questions: [
      { q: 'Where does Malika live?', opts: ['In Bukhara', 'In Tashkent', 'In Khiva'], a: 0, why: '“I live in Bukhara with my family.”' },
      { q: 'What is her mother’s job?', opts: ['A teacher', 'A nurse', 'An engineer'], a: 1, why: '“my mother is a nurse”.' },
      { q: 'How old is her little sister?', opts: ['Four', 'Five', 'Eleven'], a: 0, why: '“My little sister is four”.' },
    ],
  },
  {
    id: 'my-home', title: 'My Home', uz: 'Mening uyim', level: 'A1', art: 'home', color: '#0E8A7A',
    blurb: 'Hovli, bog‘ va eng sevimli xona.',
    paras: [
      ['We live in a big house in a village. There are four rooms, a kitchen and a bathroom. Our house has a green roof.', 'Biz qishloqdagi katta uyda yashaymiz. To‘rtta xona, oshxona va hammom bor. Uyimizning tomi yashil.'],
      ['Behind the house there is a garden with apple and apricot trees. In summer we sit under the trees and drink tea.', 'Uy orqasida olma va o‘rik daraxtlari bor bog‘ bor. Yozda daraxtlar ostida o‘tirib choy ichamiz.'],
      ['My favourite room is my bedroom. There is a desk next to the window. I read books there every evening.', 'Mening sevimli xonam — yotoqxonam. Deraza yonida parta bor. Men u yerda har kuni kechqurun kitob o‘qiyman.'],
    ],
    words: ['roof', 'garden', 'apricot', 'bedroom', 'next to'],
    questions: [
      { q: 'What colour is the roof?', opts: ['Red', 'Green', 'Blue'], a: 1, why: '“Our house has a green roof.”' },
      { q: 'What trees are in the garden?', opts: ['Apple and apricot', 'Cherry and peach', 'Pear and grape'], a: 0, why: '“apple and apricot trees”.' },
      { q: 'Where is the desk?', opts: ['Under the bed', 'Next to the window', 'In the kitchen'], a: 1, why: '“There is a desk next to the window.”' },
    ],
  },
  {
    id: 'at-school', title: 'At School', uz: 'Maktabda', level: 'A1', art: 'school', color: '#C2405A',
    blurb: 'Kamronning sinfi va sevimli fani.',
    paras: [
      ['Kamron is in the sixth class. His school is near his house, so he walks there every morning with his friend Bekzod.', 'Kamron oltinchi sinfda o‘qiydi. Maktabi uyiga yaqin, shuning uchun har kuni ertalab do‘sti Bekzod bilan piyoda boradi.'],
      ['His favourite subject is mathematics. He likes difficult questions. When he finds the answer, he feels happy.', 'Uning sevimli fani — matematika. U qiyin savollarni yoqtiradi. Javobni topsa, o‘zini baxtli his qiladi.'],
      ['At the break, the children play football in the yard. After school, Kamron goes to the library and reads about robots.', 'Tanaffusda bolalar hovlida futbol o‘ynashadi. Darsdan keyin Kamron kutubxonaga borib, robotlar haqida o‘qiydi.'],
    ],
    words: ['subject', 'difficult', 'break', 'yard', 'library'],
    questions: [
      { q: 'How does Kamron go to school?', opts: ['By bus', 'He walks', 'By bicycle'], a: 1, why: '“he walks there every morning”.' },
      { q: 'What is his favourite subject?', opts: ['English', 'History', 'Mathematics'], a: 2, why: '“His favourite subject is mathematics.”' },
      { q: 'What does he read about in the library?', opts: ['Robots', 'Animals', 'Football'], a: 0, why: '“reads about robots”.' },
    ],
  },
  {
    id: 'food-i-like', title: 'Food I Like', uz: 'Men yoqtiradigan taomlar', level: 'A1', art: 'food', color: '#0B7FB0',
    blurb: 'Plov, meva va buvining tortini kim yoqtirmaydi?',
    paras: [
      ['I love food! For breakfast I usually eat eggs, bread and cheese. I drink green tea, not coffee.', 'Men ovqatni juda yaxshi ko‘raman! Nonushtaga odatda tuxum, non va pishloq yeyman. Qahva emas, ko‘k choy ichaman.'],
      ['My favourite dish is plov. My father cooks it on Sundays with meat, rice, carrots and onions. It is delicious!', 'Sevimli taomim — palov. Otam uni yakshanba kunlari go‘sht, guruch, sabzi va piyoz bilan pishiradi. Juda mazali!'],
      ['In summer there are a lot of fruits: melons, grapes and peaches. But my grandmother’s honey cake is the best.', 'Yozda mevalar ko‘p: qovun, uzum, shaftoli. Lekin buvimning asalli torti eng zo‘ri.'],
    ],
    words: ['breakfast', 'cheese', 'delicious', 'melon', 'honey'],
    questions: [
      { q: 'What does the writer drink in the morning?', opts: ['Coffee', 'Green tea', 'Milk'], a: 1, why: '“I drink green tea, not coffee.”' },
      { q: 'Who cooks plov?', opts: ['The father', 'The grandmother', 'The writer'], a: 0, why: '“My father cooks it on Sundays”.' },
      { q: 'What is the best, says the writer?', opts: ['Peaches', 'Plov', 'Grandmother’s honey cake'], a: 2, why: '“my grandmother’s honey cake is the best”.' },
    ],
  },
  {
    id: 'our-vacation', title: 'Our Vacation', uz: 'Bizning ta’tilimiz', level: 'A2', art: 'mountain', color: '#5A8F1E',
    blurb: 'Chimyon tog‘lariga sayohat.',
    paras: [
      ['Last summer we went to the mountains near Tashkent. We travelled by car, and the journey took two hours.', 'O‘tgan yozda Toshkent yaqinidagi tog‘larga bordik. Mashinada yo‘l oldik, safar ikki soat davom etdi.'],
      ['We stayed in a small hotel next to a river. The water was very cold, but my brother swam in it anyway!', 'Daryo yonidagi kichik mehmonxonada qoldik. Suv juda sovuq edi, lekin akam baribir unda suzdi!'],
      ['Every morning we walked in the forest and took pictures of birds and flowers. It was the best holiday of my life.', 'Har kuni ertalab o‘rmonda sayr qildik, qushlar va gullarni suratga oldik. Bu hayotimdagi eng yaxshi ta’til edi.'],
    ],
    words: ['mountain', 'journey', 'hotel', 'river', 'forest'],
    questions: [
      { q: 'How long was the journey?', opts: ['One hour', 'Two hours', 'Five hours'], a: 1, why: '“the journey took two hours”.' },
      { q: 'Where was the hotel?', opts: ['Next to a river', 'In the city', 'On a mountain top'], a: 0, why: '“a small hotel next to a river”.' },
      { q: 'Who swam in the cold water?', opts: ['The writer', 'The brother', 'The father'], a: 1, why: '“my brother swam in it anyway”.' },
    ],
  },
  {
    id: 'two-tails', title: 'The Kite with Two Tails', uz: 'Ikki dumli varrak', level: 'A1', art: 'kite', color: '#2B4BE0',
    blurb: 'Shamolli sohilda ikki do‘stning o‘yini.',
    paras: [
      ['The beach near the lake is windy. Alisher brings a red kite. It has two long tails. His friend Emre wants to help.', 'Ko‘l yonidagi sohilda shamol esmoqda. Alisher qizil varrak olib keladi. Uning ikkita uzun dumi bor. Do‘sti Emre yordam bermoqchi.'],
      ['Emre holds the kite. Alisher holds the string. They run across the sand. The kite goes up. Its tails dance in the air.', 'Emre varrakni ushlab turadi. Alisher ipini ushlaydi. Ular qum ustida yugurishadi. Varrak yuqoriga ko‘tariladi. Uning dumlari havoda raqs tushadi.'],
      ['Then the boys take turns. At the end, Emre holds the string and Alisher watches from the side. “Next time, a kite with three tails!” he laughs.', 'Keyin bolalar navbatma-navbat ushlashadi. Oxirida ipni Emre ushlaydi, Alisher esa chetdan kuzatadi. “Keyingi safar — uch dumli varrak!” deb kuladi u.'],
    ],
    words: ['kite', 'string', 'sand', 'take turns', 'windy'],
    questions: [
      { q: 'What colour is the kite?', opts: ['Blue', 'Red', 'Yellow'], a: 1, why: '“Alisher brings a red kite.”' },
      { q: 'Where do the boys run?', opts: ['Across a road', 'Through an orchard', 'Across the sand'], a: 2, why: 'Bolalar varrakni ko‘tarish uchun sohil qumi ustida yugurishadi.' },
      { q: 'Who holds the string at the end?', opts: ['Emre', 'Alisher', 'Both'], a: 0, why: 'Oxirgi xatboshida ipni Emre ushlagani, Alisher esa chetdan kuzatgani yozilgan.' },
    ],
  },
];

export const storyById = (id) => STORIES.find((s) => s.id === id);
export const wordCount = (s) => s.paras.reduce((n, p) => n + p[0].split(/\s+/).length, 0);
