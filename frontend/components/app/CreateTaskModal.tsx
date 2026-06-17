'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Loader2, X } from 'lucide-react';
import type { ApiMember, ApiProject } from '@/lib/api';
import { tasksApi } from '@/lib/api';
import { cn } from '@/lib/utils';

interface CreateTaskModalProps {
  workspaceId: string;
  projects: ApiProject[];
  members: ApiMember[];
  defaultProjectId?: string;
  onCreated: () => void;
  onClose: () => void;
}

function memberName(m: ApiMember) {
  const full = `${m.user?.firstName ?? ''} ${m.user?.lastName ?? ''}`.trim();
  return full || m.user?.email || 'Unknown';
}

const PRIORITY_OPTS = [
  { value: 'low', label: 'Past', color: 'text-green-600' },
  { value: 'medium', label: 'O\'rta', color: 'text-amber-500' },
  { value: 'high', label: 'Yuqori', color: 'text-orange-500' },
  { value: 'critical', label: 'Kritik', color: 'text-rose-600' },
];

const MEMBER_ROLES: Record<string, string> = {
  developer: '💻 Dasturchi',
  designer: '🎨 Dizayner',
  qa: '🔍 QA',
  devops: '⚙️ DevOps',
  manager: '📋 Menejer',
  senior: '⭐ Senior',
  lead: '🏆 Lead',
};

function roleLabel(role: string) {
  return MEMBER_ROLES[role] ?? role;
}

export function CreateTaskModal({
  workspaceId,
  projects,
  members,
  defaultProjectId,
  onCreated,
  onClose,
}: CreateTaskModalProps) {
  const [projectId, setProjectId] = useState(defaultProjectId ?? projects[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!title.trim()) { setError("Task nomi kiritilishi shart"); return; }
    if (!projectId) { setError("Loyihani tanlang"); return; }
    setError('');
    setSaving(true);
    try {
      await tasksApi.create({
        projectId,
        workspaceId,
        title: title.trim(),
        description: description.trim() || undefined,
        assigneeId: assigneeId || undefined,
        priority: priority as 'low' | 'medium' | 'high' | 'critical',
        dueDate: dueDate || undefined,
        status: 'todo',
      });
      onCreated();
      onClose();
    } catch {
      setError("Task yaratishda xatolik");
    } finally {
      setSaving(false);
    }
  };

  const selectedMember = members.find((m) => m.userId === assigneeId);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-green-50 text-green-600 dark:bg-green-500/15 dark:text-green-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold">Yangi task</h3>
              <p className="text-xs text-muted-foreground">Vazifa yaratish va tayinlash</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-xl text-muted-foreground hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Project */}
          <div>
            <label className="mb-1.5 block text-xs font-black uppercase tracking-wide text-muted-foreground">Loyiha</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-400/20 transition-all"
            >
              <option value="">Tanlang...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="mb-1.5 block text-xs font-black uppercase tracking-wide text-muted-foreground">
              Task nomi <span className="text-rose-500">*</span>
            </label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleCreate(); }}
              placeholder="Nima qilish kerak?"
              className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-400/20 transition-all"
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-xs font-black uppercase tracking-wide text-muted-foreground">Tavsif</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Batafsil tushuntirish..."
              rows={2}
              className="w-full resize-none rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-400/20 transition-all"
            />
          </div>

          {/* Assignee + Priority row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-black uppercase tracking-wide text-muted-foreground">Tayinlash</label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm outline-none focus:border-green-400 transition-all"
              >
                <option value="">Tayinlanmagan</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {memberName(m)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-black uppercase tracking-wide text-muted-foreground">Muhimlik</label>
              <div className="flex gap-1.5 flex-wrap">
                {PRIORITY_OPTS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPriority(p.value)}
                    className={cn(
                      "rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors",
                      priority === p.value
                        ? "border-current bg-current/10 " + p.color
                        : "border-border text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Assignee role tag */}
          {selectedMember && (
            <div className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2">
              <div className="grid h-7 w-7 place-items-center rounded-lg bg-card text-sm font-bold">
                {(selectedMember.user?.firstName?.[0] ?? '?').toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold">{memberName(selectedMember)}</p>
                <p className="text-[10px] text-muted-foreground">{roleLabel(selectedMember.role)}</p>
              </div>
              <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 dark:bg-indigo-500/15 dark:text-indigo-400 px-2 py-0.5 rounded-lg">
                Xabar yuboriladi
              </span>
            </div>
          )}

          {/* Due date */}
          <div>
            <label className="mb-1.5 block text-xs font-black uppercase tracking-wide text-muted-foreground">Muddat (deadline)</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-400/20 transition-all"
            />
          </div>

          {error && <p className="text-xs font-semibold text-rose-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 pb-5">
          <button type="button" onClick={onClose} className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
            Bekor
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving || !title.trim() || !projectId}
            className="flex items-center gap-2 rounded-xl bg-green-600 px-5 py-2 text-sm font-bold text-white hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Task yaratish
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
