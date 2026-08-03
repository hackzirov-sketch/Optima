export interface BannedContent {
  id: string;

  pattern: string;

  type: string; // 'word' | 'phrase' | 'regex'

  category: string | null; // 'hate' | 'violence' | 'sexual' | 'spam'

  severity: string; // 'low' | 'medium' | 'high' | 'critical'

  isRegex: boolean;

  active: boolean;

  createdAt: Date;
}
