import { extractMentions, MAX_MENTIONS_PER_MESSAGE } from './mention.util';

describe('extractMentions', () => {
  it('finds a mention at the start and mid-sentence', () => {
    expect(extractMentions('@alice can you look?')).toEqual(['alice']);
    expect(extractMentions('ping @bob about it')).toEqual(['bob']);
  });

  it('finds several, in the order written', () => {
    expect(extractMentions('@alice and @bob and @carol')).toEqual([
      'alice',
      'bob',
      'carol',
    ]);
  });

  it('treats a repeated name as one person', () => {
    // Two notifications for one message reads as a bug to the recipient.
    expect(extractMentions('@alice @alice @Alice')).toEqual(['alice']);
  });

  it('is case-insensitive, matching how usernames are compared elsewhere', () => {
    expect(extractMentions('@Alice')).toEqual(['alice']);
  });

  it('does not read an email address as a mention', () => {
    // The single most common false positive; `@example` is part of an address,
    // not a reference to a user.
    expect(extractMentions('write to someone@example.com')).toEqual([]);
  });

  it('ignores names shorter than a real username', () => {
    // Usernames are at least 3 characters, so `@ok` cannot be one.
    expect(extractMentions('@ok @al')).toEqual([]);
  });

  it('stops at the username charset', () => {
    expect(extractMentions('@alice, please')).toEqual(['alice']);
    expect(extractMentions('(@bob)')).toEqual(['bob']);
    expect(extractMentions('@carol.smith')).toEqual(['carol']);
  });

  it('accepts underscores and hyphens', () => {
    expect(extractMentions('@my_user-name')).toEqual(['my_user-name']);
  });

  it('caps how many one message can mention', () => {
    const many = Array.from({ length: 40 }, (_, i) => `@user${i}`).join(' ');

    // Each mention costs a notification row, a socket push and — at MENTION's
    // HIGH priority — an SMS or Telegram message.
    expect(extractMentions(many)).toHaveLength(MAX_MENTIONS_PER_MESSAGE);
  });

  it('handles empty and missing content', () => {
    expect(extractMentions('')).toEqual([]);
    expect(extractMentions(null)).toEqual([]);
    expect(extractMentions(undefined)).toEqual([]);
  });

  it('ignores a bare @', () => {
    expect(extractMentions('what @ time?')).toEqual([]);
  });
});
