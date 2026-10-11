import { flushPeriodSeconds } from './media-counters.service';
import { newSlug } from './media.service';

const exact = () => 0.5; // no jitter

describe('flushPeriodSeconds', () => {
  it('is a quarter of the video, so items land on their own rhythm', () => {
    expect(flushPeriodSeconds(20 * 60, exact)).toBe(5 * 60);
    expect(flushPeriodSeconds(22 * 60, exact)).toBe(5.5 * 60);
  });
  it('never drops below 3 minutes or above 30', () => {
    expect(flushPeriodSeconds(0, exact)).toBe(180);
    expect(flushPeriodSeconds(90, exact)).toBe(180);
    expect(flushPeriodSeconds(59 * 60, exact)).toBe(14.75 * 60);
  });
  it('quarters again for videos over an hour', () => {
    expect(flushPeriodSeconds(2 * 3600, exact)).toBe(450);
    expect(flushPeriodSeconds(10 * 3600, exact)).toBe(1800);
  });
  it('adds ±10% jitter', () => {
    expect(flushPeriodSeconds(20 * 60, () => 0)).toBe(270);
    expect(flushPeriodSeconds(20 * 60, () => 0.999)).toBeGreaterThanOrEqual(329);
  });
});

describe('newSlug', () => {
  it('is 8 url-safe characters without look-alikes', () => {
    for (let i = 0; i < 200; i++) expect(newSlug()).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{8}$/);
  });
});
