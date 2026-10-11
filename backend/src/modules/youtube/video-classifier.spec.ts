import { classifyVideo } from './video-classifier';

const minutes = (n: number) => n * 60;
const verdict = (title: string, extra: Partial<Parameters<typeof classifyVideo>[0]> = {}) =>
  classifyVideo({ title, durationSeconds: minutes(20), ...extra });

describe('classifyVideo', () => {
  it('keeps lessons, lectures, explainers and serious podcasts', () => {
    for (const title of [
      'System Design Interview: How Netflix Scales — Deep Dive',
      'Python dasturlash darslari #1 — noldan boshlab',
      'Лекция по линейной алгебре, MIT 18.06',
      'How DNS works explained',
      'Lex Fridman Podcast: The future of AI and machine learning',
      'IELTS Speaking: grammar lesson for beginners',
      'Atomic Habits — kitob tahlili',
    ]) {
      const result = verdict(title, { categoryId: '27' });
      expect({ title, rejected: result.rejected }).toEqual({ title, rejected: false });
    }
  });

  it('rejects pranks, music, films, gaming, comedy and shorts — wherever they come from', () => {
    const cases: Array<[string, Partial<Parameters<typeof classifyVideo>[0]>]> = [
      ['EPIC PRANK on my brother!!!', { categoryId: '24' }],
      ['Shahzoda - Yangi klip (Official Video)', { categoryId: '10' }],
      ["Ajoyib qaynsingil (o'zbek kino)", { categoryId: '1' }],
      ['Minecraft gameplay part 12', { categoryId: '20' }],
      ['Funny moments compilation 2026', { categoryId: '23' }],
      ['Quick tip', { durationSeconds: 40 }],
      ['Mukbang spicy noodles', {}],
      ['Movie trailer 2026', { categoryId: '44' }],
    ];
    for (const [title, extra] of cases) expect({ title, rejected: verdict(title, extra).rejected }).toEqual({ title, rejected: true });
  });

  it('does not confuse lessons that merely mention a blocked word', () => {
    expect(verdict('The psychology of comedy — a lecture on humor research', { categoryId: '27' }).rejected).toBe(false);
    expect(verdict('Serial communication tutorial for Arduino programming', { categoryId: '28' }).rejected).toBe(false);
    expect(verdict('Golang tutorial for beginners', { categoryId: '27' }).rejected).toBe(false);
    expect(verdict('Coding challenge: build a REST API in Node.js', { categoryId: '28' }).rejected).toBe(false);
  });

  it('a plain vlog with no teaching signal is not enough', () => {
    expect(verdict('My weekend vlog in Tashkent', { categoryId: '22' }).rejected).toBe(true);
  });

  it('labels content types and topics', () => {
    const podcast = verdict('Biznes podkast: startap qanday quriladi', { categoryId: '22' });
    expect(podcast.contentType).toBe('podcast');
    expect(podcast.topics).toContain('business');
    expect(verdict('Docker tutorial: containers from scratch', { categoryId: '28' }).contentType).toBe('tutorial');
    expect(verdict('Distributed systems explained', { categoryId: '28' }).topics).toContain('system_design');
    expect(verdict('System Design Interview Prep for Beginners (Full Course)', { categoryId: '27' }).contentType).toBe('tutorial');
    expect(verdict('Interview with Andrej Karpathy on neural networks', { categoryId: '28' }).contentType).toBe('interview');
  });

  it('penalises shouting titles', () => {
    const calm = verdict('How the immune system works explained', { categoryId: '27' }).educational;
    const loud = verdict('HOW THE IMMUNE SYSTEM WORKS EXPLAINED!!!', { categoryId: '27' }).educational;
    expect(loud).toBeLessThan(calm);
  });
});
