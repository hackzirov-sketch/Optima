'use client';

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface TaskCompletionModalProps {
  taskTitle: string;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}

export function TaskCompletionModal({ taskTitle, onConfirm, onCancel }: TaskCompletionModalProps) {
  const [note, setNote] = useState('');
  const textRef = useRef<HTMLTextAreaElement>(null);

  const handleConfirm = () => {
    onConfirm(note.trim());
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-background border border-border rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h3 className="text-base font-semibold mb-1">Task bajarildi</h3>
        <p className="text-sm text-muted-foreground mb-4 truncate">&quot;{taskTitle}&quot;</p>

        <label className="block text-sm font-medium mb-2">
          Nima qilindi? <span className="text-muted-foreground font-normal">(ixtiyoriy)</span>
        </label>
        <textarea
          ref={textRef}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Qisqacha tavsif yozing..."
          className="w-full h-24 resize-none rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleConfirm();
            if (e.key === 'Escape') onCancel();
          }}
        />

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
          >
            Bekor qilish
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Bajarildi ✓
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
