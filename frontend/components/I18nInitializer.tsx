'use client';

import { useEffect } from 'react';
import i18n from '@/i18n';

export function I18nInitializer() {
  useEffect(() => {
    // i18n already initialized in @/i18n/index.ts
    // This component just ensures it runs on client
  }, []);

  return null;
}
