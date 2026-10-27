/*
 * OPTIMA lug'at bazasi — inglizcha / o'zbekcha / ruscha.
 * Format: so'z | so'z turkumi | o'zbekcha | ruscha | daraja | mavzu
 * Yangi so'z qo'shish uchun shunchaki yangi qator yozing.
 */
const RAW = `
mother|n|ona|мать|A1|family
father|n|ota|отец|A1|family
parents|n|ota-ona|родители|A1|family
brother|n|aka, uka|брат|A1|family
sister|n|opa, singil|сестра|A1|family
grandmother|n|buvi|бабушка|A1|family
grandfather|n|bobo|дедушка|A1|family
son|n|o‘g‘il|сын|A1|family
daughter|n|qiz (farzand)|дочь|A1|family
family|n|oila|семья|A1|family
child|n|bola|ребёнок|A1|family
children|n|bolalar|дети|A1|family
baby|n|chaqaloq|младенец|A1|family
uncle|n|amaki, tog‘a|дядя|A1|family
aunt|n|amma, xola|тётя|A1|family
cousin|n|amakivachcha, xolavachcha|двоюродный брат, сестра|A2|family
husband|n|er (turmush o‘rtog‘i)|муж|A2|family
wife|n|rafiqa, xotin|жена|A2|family
friend|n|do‘st|друг|A1|family
neighbour|n|qo‘shni|сосед|A2|family
people|n|odamlar|люди|A1|family
man|n|erkak|мужчина|A1|family
woman|n|ayol|женщина|A1|family
boy|n|o‘g‘il bola|мальчик|A1|family
girl|n|qiz bola|девочка|A1|family
name|n|ism|имя|A1|family
age|n|yosh|возраст|A1|family
guest|n|mehmon|гость|A2|family
twins|n|egizaklar|близнецы|A2|family
relative|n|qarindosh|родственник|B1|family
school|n|maktab|школа|A1|school
teacher|n|o‘qituvchi|учитель|A1|school
student|n|o‘quvchi, talaba|ученик, студент|A1|school
class|n|sinf|класс|A1|school
lesson|n|dars|урок|A1|school
book|n|kitob|книга|A1|school
notebook|n|daftar|тетрадь|A1|school
pen|n|ruchka|ручка|A1|school
pencil|n|qalam|карандаш|A1|school
bag|n|sumka|сумка|A1|school
desk|n|parta|парта|A1|school
board|n|doska|доска|A1|school
homework|n|uy vazifasi|домашнее задание|A1|school
exam|n|imtihon|экзамен|A2|school
test|n|sinov, test|тест|A1|school
question|n|savol|вопрос|A1|school
answer|n|javob|ответ|A1|school
word|n|so‘z|слово|A1|school
sentence|n|gap|предложение|A2|school
page|n|sahifa|страница|A1|school
library|n|kutubxona|библиотека|A2|school
ruler|n|chizg‘ich|линейка|A1|school
eraser|n|o‘chirg‘ich|ластик|A1|school
mark|n|baho|оценка|A2|school
subject|n|fan (o‘quv predmeti)|предмет|A2|school
mathematics|n|matematika|математика|A2|school
history|n|tarix|история|A2|school
science|n|tabiiy fanlar, ilm|наука|A2|school
language|n|til|язык|A1|school
dictionary|n|lug‘at|словарь|A2|school
break|n|tanaffus|перемена|A2|school
uniform|n|maktab formasi|школьная форма|A2|school
classmate|n|sinfdosh|одноклассник|A2|school
university|n|universitet|университет|A2|school
knowledge|n|bilim|знание|B1|school
mistake|n|xato|ошибка|A2|school
example|n|misol|пример|A2|school
rule|n|qoida|правило|A2|school
grammar|n|grammatika|грамматика|A2|school
house|n|uy|дом|A1|home
home|n|uy, xonadon|дом (родной)|A1|home
room|n|xona|комната|A1|home
kitchen|n|oshxona|кухня|A1|home
bedroom|n|yotoqxona|спальня|A1|home
bathroom|n|hammom|ванная|A1|home
door|n|eshik|дверь|A1|home
window|n|deraza|окно|A1|home
wall|n|devor|стена|A1|home
floor|n|pol; qavat|пол; этаж|A1|home
roof|n|tom|крыша|A2|home
garden|n|bog‘|сад|A1|home
yard|n|hovli|двор|A2|home
table|n|stol|стол|A1|home
chair|n|stul|стул|A1|home
bed|n|karavot|кровать|A1|home
sofa|n|divan|диван|A1|home
lamp|n|chiroq|лампа|A1|home
mirror|n|oyna (ko‘zgu)|зеркало|A2|home
carpet|n|gilam|ковёр|A2|home
cupboard|n|shkaf|шкаф|A2|home
key|n|kalit|ключ|A1|home
stairs|n|zinapoya|лестница|A2|home
flat|n|kvartira|квартира|A2|home
fridge|n|muzlatgich|холодильник|A1|home
cup|n|piyola, chashka|чашка|A1|home
plate|n|likopcha|тарелка|A1|home
spoon|n|qoshiq|ложка|A1|home
knife|n|pichoq|нож|A1|home
fork|n|vilka|вилка|A1|home
pillow|n|yostiq|подушка|A2|home
blanket|n|ko‘rpa|одеяло|A2|home
clock|n|soat (devor soati)|часы|A1|home
picture|n|rasm|картина, рисунок|A1|home
food|n|ovqat|еда|A1|food
bread|n|non|хлеб|A1|food
water|n|suv|вода|A1|food
milk|n|sut|молоко|A1|food
tea|n|choy|чай|A1|food
coffee|n|qahva|кофе|A1|food
juice|n|sharbat|сок|A1|food
apple|n|olma|яблоко|A1|food
pear|n|nok|груша|A1|food
grape|n|uzum|виноград|A1|food
melon|n|qovun|дыня|A1|food
watermelon|n|tarvuz|арбуз|A1|food
cherry|n|gilos|черешня|A2|food
apricot|n|o‘rik|абрикос|A2|food
peach|n|shaftoli|персик|A2|food
pomegranate|n|anor|гранат|A2|food
banana|n|banan|банан|A1|food
orange|n|apelsin|апельсин|A1|food
lemon|n|limon|лимон|A1|food
fruit|n|meva|фрукт|A1|food
vegetable|n|sabzavot|овощ|A1|food
carrot|n|sabzi|морковь|A1|food
potato|n|kartoshka|картофель|A1|food
onion|n|piyoz|лук|A1|food
tomato|n|pomidor|помидор|A1|food
cucumber|n|bodring|огурец|A1|food
rice|n|guruch|рис|A1|food
meat|n|go‘sht|мясо|A1|food
chicken|n|tovuq|курица|A1|food
fish|n|baliq|рыба|A1|food
egg|n|tuxum|яйцо|A1|food
cheese|n|pishloq|сыр|A1|food
butter|n|sariyog‘|сливочное масло|A2|food
sugar|n|shakar|сахар|A1|food
salt|n|tuz|соль|A1|food
soup|n|sho‘rva|суп|A1|food
salad|n|salat|салат|A1|food
cake|n|tort|торт|A1|food
honey|n|asal|мёд|A2|food
breakfast|n|nonushta|завтрак|A1|food
lunch|n|tushlik|обед|A1|food
dinner|n|kechki ovqat|ужин|A1|food
hungry|adj|och (qorni och)|голодный|A1|food
thirsty|adj|chanqagan|испытывающий жажду|A2|food
delicious|adj|mazali|вкусный|A2|food
sweet|adj|shirin|сладкий|A1|food
head|n|bosh|голова|A1|body
hair|n|soch|волосы|A1|body
face|n|yuz|лицо|A1|body
eye|n|ko‘z|глаз|A1|body
ear|n|quloq|ухо|A1|body
nose|n|burun|нос|A1|body
mouth|n|og‘iz|рот|A1|body
tooth|n|tish|зуб|A1|body
hand|n|qo‘l (kaft)|кисть руки|A1|body
arm|n|qo‘l|рука|A1|body
finger|n|barmoq|палец|A1|body
leg|n|oyoq|нога|A1|body
foot|n|oyoq panjasi|ступня|A1|body
heart|n|yurak|сердце|A2|body
back|n|orqa, bel|спина|A2|body
stomach|n|qorin, oshqozon|живот, желудок|A2|body
neck|n|bo‘yin|шея|A2|body
shoulder|n|yelka|плечо|A2|body
knee|n|tizza|колено|A2|body
body|n|tana|тело|A1|body
healthy|adj|sog‘lom|здоровый|A2|body
ill|adj|kasal|больной|A2|body
doctor|n|shifokor|врач|A1|body
medicine|n|dori|лекарство|A2|body
hospital|n|kasalxona|больница|A2|body
pain|n|og‘riq|боль|B1|body
clothes|n|kiyim|одежда|A1|clothes
shirt|n|ko‘ylak (erkaklar)|рубашка|A1|clothes
dress|n|ko‘ylak (ayollar)|платье|A1|clothes
trousers|n|shim|брюки|A1|clothes
skirt|n|yubka|юбка|A1|clothes
coat|n|palto|пальто|A1|clothes
jacket|n|kurtka|куртка|A1|clothes
shoes|n|poyabzal, tufli|обувь|A1|clothes
boots|n|etik|сапоги|A2|clothes
hat|n|shlyapa, bosh kiyim|шляпа|A1|clothes
cap|n|kepka|кепка|A1|clothes
socks|n|paypoq|носки|A1|clothes
gloves|n|qo‘lqop|перчатки|A2|clothes
scarf|n|sharf|шарф|A2|clothes
animal|n|hayvon|животное|A1|animals
dog|n|it|собака|A1|animals
cat|n|mushuk|кошка|A1|animals
horse|n|ot|лошадь|A1|animals
cow|n|sigir|корова|A1|animals
sheep|n|qo‘y|овца|A1|animals
goat|n|echki|коза|A1|animals
bird|n|qush|птица|A1|animals
camel|n|tuya|верблюд|A2|animals
donkey|n|eshak|осёл|A2|animals
lion|n|sher|лев|A1|animals
tiger|n|yo‘lbars|тигр|A1|animals
bear|n|ayiq|медведь|A1|animals
wolf|n|bo‘ri|волк|A2|animals
fox|n|tulki|лиса|A2|animals
rabbit|n|quyon|кролик|A1|animals
mouse|n|sichqon|мышь|A1|animals
elephant|n|fil|слон|A1|animals
monkey|n|maymun|обезьяна|A1|animals
snake|n|ilon|змея|A2|animals
frog|n|qurbaqa|лягушка|A2|animals
bee|n|ari|пчела|A2|animals
butterfly|n|kapalak|бабочка|A2|animals
duck|n|o‘rdak|утка|A1|animals
eagle|n|burgut|орёл|B1|animals
deer|n|kiyik|олень|B1|animals
nature|n|tabiat|природа|A2|nature
sun|n|quyosh|солнце|A1|nature
moon|n|oy (osmondagi)|луна|A1|nature
star|n|yulduz|звезда|A1|nature
sky|n|osmon|небо|A1|nature
cloud|n|bulut|облако|A1|nature
rain|n|yomg‘ir|дождь|A1|nature
snow|n|qor|снег|A1|nature
wind|n|shamol|ветер|A1|nature
weather|n|ob-havo|погода|A1|nature
sea|n|dengiz|море|A1|nature
river|n|daryo|река|A1|nature
lake|n|ko‘l|озеро|A2|nature
mountain|n|tog‘|гора|A1|nature
forest|n|o‘rmon|лес|A2|nature
tree|n|daraxt|дерево|A1|nature
flower|n|gul|цветок|A1|nature
grass|n|o‘t, maysa|трава|A2|nature
stone|n|tosh|камень|A2|nature
sand|n|qum|песок|A2|nature
desert|n|cho‘l|пустыня|A2|nature
field|n|dala|поле|A2|nature
island|n|orol|остров|B1|nature
beach|n|sohil, plyaj|пляж|A2|nature
earth|n|yer|земля|A2|nature
fire|n|olov|огонь|A2|nature
air|n|havo|воздух|A2|nature
hot|adj|issiq|жаркий|A1|nature
cold|adj|sovuq|холодный|A1|nature
warm|adj|iliq|тёплый|A1|nature
sunny|adj|quyoshli|солнечный|A1|nature
rainy|adj|yomg‘irli|дождливый|A1|nature
windy|adj|shamolli|ветреный|A2|nature
spring|n|bahor|весна|A1|nature
summer|n|yoz|лето|A1|nature
autumn|n|kuz|осень|A1|nature
winter|n|qish|зима|A1|nature
season|n|fasl|время года|A2|nature
village|n|qishloq|деревня|A2|nature
kite|n|varrak|воздушный змей|A2|nature
city|n|shahar|город|A1|city
street|n|ko‘cha|улица|A1|city
road|n|yo‘l|дорога|A1|city
bridge|n|ko‘prik|мост|A2|city
shop|n|do‘kon|магазин|A1|city
market|n|bozor|рынок|A1|city
bank|n|bank|банк|A1|city
park|n|bog‘, park|парк|A1|city
square|n|maydon|площадь|A2|city
building|n|bino|здание|A2|city
car|n|mashina|машина|A1|city
bus|n|avtobus|автобус|A1|city
train|n|poyezd|поезд|A1|city
plane|n|samolyot|самолёт|A1|city
bicycle|n|velosiped|велосипед|A1|city
taxi|n|taksi|такси|A1|city
station|n|bekat, vokzal|станция, вокзал|A2|city
airport|n|aeroport|аэропорт|A2|city
hotel|n|mehmonxona|гостиница|A2|city
ticket|n|chipta|билет|A2|city
map|n|xarita|карта|A2|city
trip|n|sayohat (qisqa)|поездка|A2|city
journey|n|safar|путешествие|A2|city
passport|n|pasport|паспорт|A2|city
luggage|n|yuk (bagaj)|багаж|B1|city
museum|n|muzey|музей|A2|city
cinema|n|kinoteatr|кинотеатр|A1|city
restaurant|n|restoran|ресторан|A1|city
mosque|n|masjid|мечеть|A2|city
left|adv|chapga|налево|A1|city
right|adv|o‘ngga|направо|A1|city
straight|adv|to‘g‘riga|прямо|A2|city
near|prep|yaqinida|рядом с|A1|city
far|adj|uzoq|далёкий|A1|city
country|n|mamlakat|страна|A1|city
world|n|dunyo|мир|A1|city
capital|n|poytaxt|столица|A2|city
time|n|vaqt|время|A1|time
day|n|kun|день|A1|time
night|n|tun|ночь|A1|time
morning|n|ertalab|утро|A1|time
evening|n|kechqurun|вечер|A1|time
week|n|hafta|неделя|A1|time
month|n|oy (taqvim)|месяц|A1|time
year|n|yil|год|A1|time
hour|n|soat (vaqt)|час|A1|time
minute|n|daqiqa|минута|A1|time
today|adv|bugun|сегодня|A1|time
tomorrow|adv|ertaga|завтра|A1|time
yesterday|adv|kecha|вчера|A1|time
now|adv|hozir|сейчас|A1|time
always|adv|doim|всегда|A1|time
usually|adv|odatda|обычно|A2|time
often|adv|tez-tez|часто|A2|time
sometimes|adv|ba’zan|иногда|A2|time
never|adv|hech qachon|никогда|A2|time
early|adv|erta|рано|A1|time
late|adv|kech|поздно|A1|time
Monday|n|dushanba|понедельник|A1|time
Tuesday|n|seshanba|вторник|A1|time
Wednesday|n|chorshanba|среда|A1|time
Thursday|n|payshanba|четверг|A1|time
Friday|n|juma|пятница|A1|time
Saturday|n|shanba|суббота|A1|time
Sunday|n|yakshanba|воскресенье|A1|time
birthday|n|tug‘ilgan kun|день рождения|A1|time
holiday|n|bayram; ta’til|праздник; каникулы|A2|time
weekend|n|dam olish kunlari|выходные|A2|time
one|num|bir|один|A1|numbers
two|num|ikki|два|A1|numbers
three|num|uch|три|A1|numbers
four|num|to‘rt|четыре|A1|numbers
five|num|besh|пять|A1|numbers
six|num|olti|шесть|A1|numbers
seven|num|yetti|семь|A1|numbers
eight|num|sakkiz|восемь|A1|numbers
nine|num|to‘qqiz|девять|A1|numbers
ten|num|o‘n|десять|A1|numbers
twenty|num|yigirma|двадцать|A1|numbers
hundred|num|yuz|сто|A1|numbers
thousand|num|ming|тысяча|A1|numbers
first|num|birinchi|первый|A1|numbers
second|num|ikkinchi|второй|A1|numbers
red|adj|qizil|красный|A1|colors
blue|adj|ko‘k|синий|A1|colors
green|adj|yashil|зелёный|A1|colors
yellow|adj|sariq|жёлтый|A1|colors
black|adj|qora|чёрный|A1|colors
white|adj|oq|белый|A1|colors
brown|adj|jigarrang|коричневый|A1|colors
pink|adj|pushti|розовый|A1|colors
grey|adj|kulrang|серый|A1|colors
purple|adj|binafsharang|фиолетовый|A1|colors
job|n|ish (kasb)|работа|A1|jobs
driver|n|haydovchi|водитель|A1|jobs
farmer|n|dehqon, fermer|фермер|A2|jobs
engineer|n|muhandis|инженер|A2|jobs
nurse|n|hamshira|медсестра|A2|jobs
chef|n|oshpaz|повар|A2|jobs
police officer|n|politsiya xodimi|полицейский|A2|jobs
builder|n|quruvchi|строитель|A2|jobs
pilot|n|uchuvchi|пилот|A2|jobs
artist|n|rassom|художник|A2|jobs
singer|n|qo‘shiqchi|певец|A1|jobs
writer|n|yozuvchi|писатель|A2|jobs
programmer|n|dasturchi|программист|A2|jobs
seller|n|sotuvchi|продавец|A2|jobs
office|n|ofis, idora|офис|A2|jobs
money|n|pul|деньги|A1|jobs
sport|n|sport|спорт|A1|sport
football|n|futbol|футбол|A1|sport
game|n|o‘yin|игра|A1|sport
team|n|jamoa|команда|A2|sport
ball|n|to‘p|мяч|A1|sport
chess|n|shaxmat|шахматы|A2|sport
music|n|musiqa|музыка|A1|sport
song|n|qo‘shiq|песня|A1|sport
film|n|film|фильм|A1|sport
hobby|n|qiziqish, sevimli mashg‘ulot|хобби|A2|sport
happy|adj|xursand|счастливый|A1|feelings
sad|adj|xafa|грустный|A1|feelings
angry|adj|jahli chiqqan|злой|A1|feelings
tired|adj|charchagan|уставший|A1|feelings
afraid|adj|qo‘rqqan|испуганный|A2|feelings
surprised|adj|hayron|удивлённый|A2|feelings
bored|adj|zerikkan|скучающий|A2|feelings
good|adj|yaxshi|хороший|A1|adjectives
bad|adj|yomon|плохой|A1|adjectives
big|adj|katta|большой|A1|adjectives
small|adj|kichik|маленький|A1|adjectives
long|adj|uzun|длинный|A1|adjectives
short|adj|qisqa; past bo‘yli|короткий; низкий|A1|adjectives
tall|adj|baland bo‘yli|высокий|A1|adjectives
new|adj|yangi|новый|A1|adjectives
old|adj|eski; keksa|старый|A1|adjectives
young|adj|yosh|молодой|A1|adjectives
beautiful|adj|chiroyli|красивый|A1|adjectives
easy|adj|oson|лёгкий|A1|adjectives
difficult|adj|qiyin|трудный|A2|adjectives
fast|adj|tez|быстрый|A1|adjectives
slow|adj|sekin|медленный|A1|adjectives
rich|adj|boy|богатый|A2|adjectives
poor|adj|kambag‘al|бедный|A2|adjectives
clean|adj|toza|чистый|A1|adjectives
dirty|adj|iflos|грязный|A1|adjectives
full|adj|to‘la|полный|A2|adjectives
empty|adj|bo‘sh|пустой|A2|adjectives
kind|adj|mehribon|добрый|A2|adjectives
clever|adj|aqlli|умный|A2|adjectives
brave|adj|jasur|храбрый|A2|adjectives
funny|adj|kulgili|смешной|A2|adjectives
quiet|adj|jim, osoyishta|тихий|A2|adjectives
loud|adj|baland ovozli|громкий|A2|adjectives
cheap|adj|arzon|дешёвый|A2|adjectives
expensive|adj|qimmat|дорогой|A2|adjectives
strong|adj|kuchli|сильный|A2|adjectives
weak|adj|kuchsiz|слабый|A2|adjectives
busy|adj|band|занятой|A2|adjectives
free|adj|bo‘sh; bepul|свободный; бесплатный|A2|adjectives
important|adj|muhim|важный|A2|adjectives
interesting|adj|qiziqarli|интересный|A2|adjectives
different|adj|turli, boshqacha|разный|A2|adjectives
same|adj|bir xil|одинаковый|A2|adjectives
wrong|adj|noto‘g‘ri|неправильный|A2|adjectives
ready|adj|tayyor|готовый|A2|adjectives
famous|adj|mashhur|знаменитый|B1|adjectives
safe|adj|xavfsiz|безопасный|B1|adjectives
dangerous|adj|xavfli|опасный|B1|adjectives
polite|adj|xushmuomala|вежливый|B1|adjectives
honest|adj|halol, rostgo‘y|честный|B1|adjectives
lazy|adj|dangasa|ленивый|B1|adjectives
careful|adj|ehtiyotkor|осторожный|B1|adjectives
resilient|adj|chidamli, tez tiklanuvchi|стойкий|C1|adjectives
be|v|bo‘lmoq|быть|A1|verbs
have|v|ega bo‘lmoq|иметь|A1|verbs
do|v|qilmoq|делать|A1|verbs
go|v|bormoq|идти, ехать|A1|verbs
come|v|kelmoq|приходить|A1|verbs
see|v|ko‘rmoq|видеть|A1|verbs
look|v|qaramoq|смотреть|A1|verbs
watch|v|tomosha qilmoq|смотреть (фильм)|A1|verbs
listen|v|tinglamoq|слушать|A1|verbs
hear|v|eshitmoq|слышать|A1|verbs
speak|v|gapirmoq|говорить|A1|verbs
say|v|aytmoq|сказать|A1|verbs
tell|v|aytib bermoq|рассказывать|A1|verbs
talk|v|suhbatlashmoq|разговаривать|A1|verbs
read|v|o‘qimoq|читать|A1|verbs
write|v|yozmoq|писать|A1|verbs
learn|v|o‘rganmoq|учить|A1|verbs
study|v|o‘qimoq, o‘rganmoq|учиться|A1|verbs
teach|v|o‘rgatmoq|преподавать|A2|verbs
know|v|bilmoq|знать|A1|verbs
think|v|o‘ylamoq|думать|A1|verbs
understand|v|tushunmoq|понимать|A1|verbs
remember|v|eslamoq|помнить|A2|verbs
forget|v|unutmoq|забывать|A2|verbs
want|v|xohlamoq|хотеть|A1|verbs
like|v|yoqtirmoq|нравиться|A1|verbs
love|v|sevmoq|любить|A1|verbs
need|v|muhtoj bo‘lmoq, kerak bo‘lmoq|нуждаться|A1|verbs
help|v|yordam bermoq|помогать|A1|verbs
give|v|bermoq|давать|A1|verbs
take|v|olmoq|брать|A1|verbs
bring|v|olib kelmoq|приносить|A2|verbs
buy|v|sotib olmoq|покупать|A1|verbs
sell|v|sotmoq|продавать|A2|verbs
pay|v|to‘lamoq|платить|A2|verbs
open|v|ochmoq|открывать|A1|verbs
close|v|yopmoq|закрывать|A1|verbs
start|v|boshlamoq|начинать|A1|verbs
finish|v|tugatmoq|заканчивать|A1|verbs
stop|v|to‘xtatmoq|останавливать|A1|verbs
wait|v|kutmoq|ждать|A1|verbs
live|v|yashamoq|жить|A1|verbs
eat|v|yemoq|есть|A1|verbs
drink|v|ichmoq|пить|A1|verbs
cook|v|ovqat pishirmoq|готовить|A1|verbs
sleep|v|uxlamoq|спать|A1|verbs
wake up|v|uyg‘onmoq|просыпаться|A1|verbs
wash|v|yuvmoq|мыть|A1|verbs
sit|v|o‘tirmoq|сидеть|A1|verbs
stand|v|turmoq|стоять|A1|verbs
walk|v|yurmoq, piyoda yurmoq|ходить пешком|A1|verbs
run|v|yugurmoq|бегать|A1|verbs
swim|v|suzmoq|плавать|A1|verbs
jump|v|sakramoq|прыгать|A1|verbs
dance|v|raqsga tushmoq|танцевать|A1|verbs
sing|v|kuylamoq|петь|A1|verbs
draw|v|chizmoq|рисовать|A1|verbs
play|v|o‘ynamoq|играть|A1|verbs
drive|v|mashina haydamoq|водить|A2|verbs
fly|v|uchmoq|летать|A2|verbs
travel|v|sayohat qilmoq|путешествовать|A2|verbs
visit|v|tashrif buyurmoq|посещать|A2|verbs
meet|v|uchrashmoq|встречать|A1|verbs
call|v|qo‘ng‘iroq qilmoq|звонить|A1|verbs
ask|v|so‘ramoq|спрашивать|A1|verbs
try|v|urinmoq|пытаться|A2|verbs
find|v|topmoq|находить|A1|verbs
lose|v|yo‘qotmoq|терять|A2|verbs
make|v|yasamoq|делать, создавать|A1|verbs
build|v|qurmoq|строить|A2|verbs
use|v|foydalanmoq|использовать|A2|verbs
choose|v|tanlamoq|выбирать|A2|verbs
decide|v|qaror qilmoq|решать|A2|verbs
borrow|v|qarzga olmoq|брать взаймы|B1|verbs
lend|v|qarzga bermoq|давать взаймы|B1|verbs
improve|v|yaxshilamoq|улучшать|B1|verbs
achieve|v|erishmoq|достигать|B1|verbs
explain|v|tushuntirmoq|объяснять|A2|verbs
describe|v|tasvirlamoq|описывать|A2|verbs
believe|v|ishonmoq|верить|B1|verbs
hope|v|umid qilmoq|надеяться|A2|verbs
feel|v|his qilmoq|чувствовать|A2|verbs
smile|v|jilmaymoq|улыбаться|A2|verbs
laugh|v|kulmoq|смеяться|A2|verbs
cry|v|yig‘lamoq|плакать|A2|verbs
carry|v|ko‘tarib bormoq|нести|A2|verbs
hold|v|ushlab turmoq|держать|A2|verbs
put|v|qo‘ymoq|класть|A2|verbs
send|v|yubormoq|отправлять|A2|verbs
grow|v|o‘smoq; o‘stirmoq|расти; выращивать|A2|verbs
change|v|o‘zgartirmoq|менять|A2|verbs
move|v|harakatlanmoq; ko‘chmoq|двигаться; переезжать|A2|verbs
return|v|qaytmoq|возвращаться|A2|verbs
arrive|v|yetib kelmoq|прибывать|A2|verbs
leave|v|ketmoq; tark etmoq|уходить, уезжать|A2|verbs
stay|v|qolmoq|оставаться|A2|verbs
enjoy|v|zavqlanmoq|наслаждаться|A2|verbs
prefer|v|afzal ko‘rmoq|предпочитать|B1|verbs
agree|v|rozi bo‘lmoq|соглашаться|B1|verbs
practise|v|mashq qilmoq|практиковаться|A2|verbs
repeat|v|takrorlamoq|повторять|A2|verbs
translate|v|tarjima qilmoq|переводить|A2|verbs
count|v|sanamoq|считать|A1|verbs
computer|n|kompyuter|компьютер|A1|tech
phone|n|telefon|телефон|A1|tech
internet|n|internet|интернет|A1|tech
message|n|xabar|сообщение|A2|tech
email|n|elektron pochta|электронная почта|A2|tech
screen|n|ekran|экран|A2|tech
keyboard|n|klaviatura|клавиатура|A2|tech
password|n|parol|пароль|A2|tech
website|n|veb-sayt|веб-сайт|A2|tech
video|n|video|видео|A1|tech
camera|n|kamera|камера|A1|tech
robot|n|robot|робот|A2|tech
app|n|ilova|приложение|A2|tech
download|v|yuklab olmoq|скачивать|B1|tech
battery|n|batareya|батарея|B1|tech
opportunity|n|imkoniyat|возможность|B1|abstract
experience|n|tajriba|опыт|B1|abstract
environment|n|atrof-muhit|окружающая среда|B1|abstract
government|n|hukumat|правительство|B2|abstract
society|n|jamiyat|общество|B2|abstract
culture|n|madaniyat|культура|B1|abstract
tradition|n|an’ana|традиция|B1|abstract
future|n|kelajak|будущее|A2|abstract
past|n|o‘tmish|прошлое|A2|abstract
success|n|muvaffaqiyat|успех|B1|abstract
effort|n|harakat, kuch sarflash|усилие|B1|abstract
goal|n|maqsad|цель|A2|abstract
decision|n|qaror|решение|B1|abstract
advice|n|maslahat|совет|B1|abstract
problem|n|muammo|проблема|A2|abstract
solution|n|yechim|решение (задачи)|B1|abstract
reason|n|sabab|причина|B1|abstract
result|n|natija|результат|B1|abstract
research|n|tadqiqot|исследование|B2|abstract
development|n|rivojlanish|развитие|B2|abstract
responsibility|n|mas’uliyat|ответственность|B2|abstract
health|n|salomatlik|здоровье|A2|abstract
freedom|n|erkinlik|свобода|B1|abstract
skill|n|ko‘nikma|навык|B1|abstract
achievement|n|yutuq|достижение|B1|abstract
challenge|n|qiyin sinov|вызов, трудность|B2|abstract
increase|v|oshirmoq|увеличивать|B1|abstract
reduce|v|kamaytirmoq|уменьшать|B2|abstract
protect|v|himoya qilmoq|защищать|B1|abstract
prepare|v|tayyorlamoq|готовить(ся)|B1|abstract
develop|v|rivojlantirmoq|развивать|B1|abstract
compare|v|solishtirmoq|сравнивать|B1|abstract
suggest|v|taklif qilmoq|предлагать|B1|abstract
avoid|v|chetlab o‘tmoq|избегать|B2|abstract
support|v|qo‘llab-quvvatlamoq|поддерживать|B1|abstract
consider|v|ko‘rib chiqmoq|рассматривать|B2|abstract
although|conj|garchi|хотя|B1|grammar
however|adv|biroq|однако|B1|grammar
therefore|adv|shuning uchun|поэтому|B2|grammar
because|conj|chunki|потому что|A1|grammar
but|conj|lekin|но|A1|grammar
and|conj|va|и|A1|grammar
or|conj|yoki|или|A1|grammar
if|conj|agar|если|A2|grammar
in|prep|ichida|в|A1|grammar
on|prep|ustida|на|A1|grammar
under|prep|ostida|под|A1|grammar
behind|prep|orqasida|за, позади|A1|grammar
between|prep|orasida|между|A2|grammar
next to|prep|yonida|рядом с|A1|grammar
at|prep|-da (joy, vaqt)|в, у (место, время)|A1|grammar
with|prep|bilan|с|A1|grammar
without|prep|-siz|без|A2|grammar
from|prep|-dan|из, от|A1|grammar
to|prep|-ga|к, в|A1|grammar
I|pron|men|я|A1|grammar
you|pron|sen, siz|ты, вы|A1|grammar
he|pron|u (erkak)|он|A1|grammar
she|pron|u (ayol)|она|A1|grammar
it|pron|u (narsa, hayvon)|оно|A1|grammar
we|pron|biz|мы|A1|grammar
they|pron|ular|они|A1|grammar
my|pron|mening|мой|A1|grammar
your|pron|sening, sizning|твой, ваш|A1|grammar
his|pron|uning (erkak)|его|A1|grammar
her|pron|uning (ayol)|её|A1|grammar
our|pron|bizning|наш|A1|grammar
their|pron|ularning|их|A1|grammar
this|pron|bu|это, этот|A1|grammar
that|pron|u, o‘sha|то, тот|A1|grammar
these|pron|bular|эти|A1|grammar
those|pron|o‘shalar|те|A1|grammar
what|pron|nima|что|A1|grammar
where|adv|qayerda|где|A1|grammar
who|pron|kim|кто|A1|grammar
when|adv|qachon|когда|A1|grammar
why|adv|nega|почему|A1|grammar
how|adv|qanday|как|A1|grammar
how many|phr|nechta|сколько|A1|grammar
hello|phr|salom|привет|A1|phrases
goodbye|phr|xayr|до свидания|A1|phrases
please|phr|iltimos|пожалуйста|A1|phrases
thank you|phr|rahmat|спасибо|A1|phrases
sorry|phr|kechirasiz, uzr|извините|A1|phrases
yes|phr|ha|да|A1|phrases
no|phr|yo‘q|нет|A1|phrases
good morning|phr|xayrli tong|доброе утро|A1|phrases
excuse me|phr|kechirasiz (murojaat)|извините (обращение)|A1|phrases
of course|phr|albatta|конечно|A2|phrases
see you|phr|ko‘rishguncha|до встречи|A1|phrases
take turns|phr|navbat bilan bajarmoq|делать по очереди|B1|phrases
string|n|ip|верёвка, нитка|A2|nature
picnic|n|piknik|пикник|A2|food
get up|v|o‘rnidan turmoq|вставать|A1|verbs
together|adv|birga|вместе|A2|grammar
`;

export const TOPICS = {
  family: 'Oila va odamlar', school: 'Maktab', home: 'Uy', food: 'Ovqat', body: 'Tana va salomatlik',
  clothes: 'Kiyim', animals: 'Hayvonlar', nature: 'Tabiat va ob-havo', city: 'Shahar va sayohat',
  time: 'Vaqt', numbers: 'Sonlar', colors: 'Ranglar', jobs: 'Kasblar', sport: 'Sport va qiziqishlar',
  feelings: 'His-tuyg‘ular', adjectives: 'Sifatlar', verbs: 'Fe’llar', tech: 'Texnologiya',
  abstract: 'Mavhum tushunchalar', grammar: 'Grammatik so‘zlar', phrases: 'Iboralar',
};

export const POS = { n: 'ot', v: 'fe’l', adj: 'sifat', adv: 'ravish', prep: 'predlog', pron: 'olmosh', conj: 'bog‘lovchi', num: 'son', phr: 'ibora' };

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];

export const WORDS = RAW.trim().split('\n').map((line, i) => {
  const [en, pos, uz, ru, level, topic] = line.split('|').map((s) => s.trim());
  return { id: i + 1, en, pos, uz, ru, level, topic };
});

const BY_EN = new Map(WORDS.map((w) => [w.en.toLowerCase(), w]));

/** Inglizcha so'z bo'yicha topadi; oddiy qo'shimchalarni ham tushunadi (kites → kite, holds → hold). */
export function lookup(token) {
  const t = String(token).toLowerCase().replace(/[^a-z' -]/g, '').trim();
  if (!t) return null;
  if (BY_EN.has(t)) return BY_EN.get(t);
  const tries = [t.replace(/'s$/, ''), t.replace(/s$/, ''), t.replace(/es$/, ''), t.replace(/ies$/, 'y'), t.replace(/ed$/, ''), t.replace(/d$/, ''), t.replace(/ing$/, ''), t.replace(/ing$/, 'e')];
  for (const x of tries) if (BY_EN.has(x)) return BY_EN.get(x);
  return null;
}

export function translation(w, lang) {
  return lang === 'ru' ? w.ru : w.uz;
}

/** Tasodifiy n ta so'z (filtr bilan). */
export function sample(n, filter = () => true) {
  const pool = WORDS.filter(filter);
  const out = [];
  const used = new Set();
  while (out.length < Math.min(n, pool.length)) {
    const i = Math.floor(Math.random() * pool.length);
    if (!used.has(i)) { used.add(i); out.push(pool[i]); }
  }
  return out;
}

/** To'g'ri javobdan tashqari noto'g'ri variantlar (iloji bo'lsa shu mavzudan). */
export function distractors(word, n, field = 'uz') {
  const same = WORDS.filter((w) => w.id !== word.id && w.topic === word.topic && w[field] !== word[field]);
  const other = WORDS.filter((w) => w.id !== word.id && w.topic !== word.topic && w.pos === word.pos);
  const pick = [...shuffle(same), ...shuffle(other)];
  const res = [];
  for (const w of pick) {
    if (res.length >= n) break;
    if (!res.some((r) => r[field] === w[field])) res.push(w);
  }
  return res;
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
