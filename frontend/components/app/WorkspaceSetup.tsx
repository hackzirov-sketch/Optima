'use client';

import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';

export function WorkspaceSetup() {
  const { createWorkspace } = useWorkspace();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      await createWorkspace(name.trim(), desc.trim() || undefined);
    } catch (err) {
      const e = err as Record<string, unknown>;
      setError(String(e?.message ?? 'Failed to create workspace'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-[28px] border border-border bg-card p-8 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300">
            <Sparkles className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-xl font-black text-foreground">Create your workspace</h1>
            <p className="text-sm text-muted-foreground">Set up your first UPZ workspace to get started.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Workspace name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="e.g. My Company, Personal Projects…"
              className="w-full rounded-2xl border border-border bg-muted px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-indigo-400 focus:bg-card"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Description (optional)</label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="What does this workspace do?"
              rows={2}
              className="w-full resize-none rounded-2xl border border-border bg-muted px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-indigo-400 focus:bg-card"
            />
          </div>

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">{error}</p>}

          <button
            type="button"
            onClick={handleCreate}
            disabled={loading || !name.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-3 text-sm font-bold text-white transition-all hover:bg-indigo-500 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? 'Creating…' : 'Create workspace'}
          </button>
        </div>
      </div>
    </div>
  );
}
