import { registerAs } from '@nestjs/config';

export default registerAs('moderation', () => ({
  // Block durations in minutes per violation count (index = count-1)
  // count=1 → 15 min, count=2 → 30 min, count≥3 → permanent
  blockDurationsMinutes: [15, 30],
  permanentBlockThreshold: 3,
  /**
   * Code-guessing protection for the join-by-code endpoints.
   *
   * This used to count 100 attempts across a one-hour window and then block
   * for the whole remaining hour, with the refusal reported in *hours*. Two
   * things were wrong with that. It punished ordinary use — the meetings UI
   * calls resolve-by-code every time someone opens a meeting, and everyone
   * behind one office NAT (or every developer on 127.0.0.1) shares a bucket,
   * so a busy afternoon locks the building out for an hour. And an hour of
   * lockout buys nothing against the attack it exists for: a brute-forcer
   * with a 32-character code space is not deterred by an hour any more than
   * by ninety seconds, because neither of them is ever going to finish.
   *
   * A short window with a short block is what actually fits: it costs a
   * scripted guesser three orders of magnitude in throughput, and a human who
   * mistypes a code a few times waits a minute and a half at worst.
   */
  ipMaxAttempts: parseInt(process.env.IP_RATE_MAX_ATTEMPTS || '40', 10),
  ipWindowSeconds: parseInt(process.env.IP_RATE_WINDOW_SECONDS || '60', 10),
  /** Hard ceiling on any block this guard issues, however it was recorded. */
  ipMaxBlockSeconds: parseInt(process.env.IP_RATE_MAX_BLOCK_SECONDS || '90', 10),
}));
