'use client';

import { useEffect } from 'react';
import i18n, { I18N_STORAGE_KEY, LANGUAGES, applyDir } from '@/i18n';

export function I18nInitializer() {
  useEffect(() => {
    const saved = localStorage.getItem(I18N_STORAGE_KEY);
    if (saved && saved !== i18n.language) {
      const supported = LANGUAGES.find((l) => l.code === saved);
      if (supported) {
        i18n.changeLanguage(supported.code);
        applyDir(supported.code);
      }
    }
  }, []);

  return null;
}
