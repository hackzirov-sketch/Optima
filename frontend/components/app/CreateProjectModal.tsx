'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Briefcase, Check, Loader2, UserCog, X } from 'lucide-react';
import type { ApiMember, ApiProject } from '@/lib/api';
import { projectsApi } from '@/lib/api';
import { cn } from '@/lib/utils';

interface CreateProjectModalProps {
  workspaceId: string;
  members: ApiMember[];
  onCreated: (project: ApiProject) => void;
  onClose: () => void;
}

function memberName(m: ApiMember) {
  const full = `${m.user?.firstName ?? ''} ${m.user?.lastName ?? ''}`.trim();
  return full || m.user?.email || 'Unknown';
}

const ROLE_LABELS: Record<string, string> = {
  developer: 'Dasturchi',
  designer: 'Dizayner',
  qa: 'QA',
  manager: 'Menejer',
  devops: 'DevOps',
};

export function CreateProjectModal({ workspaceId, members, onCreated, onClose }: CreateProjectModalProps) {
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');

  // Step 2 fields
  const [managerId, setManagerId] = useState('');
  const [managerRole, setManagerRole] = useState<'developer' | 'designer' | 'qa' | 'manager' | 'devops'>('manager');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const goNext = () => {
    if (!name.trim()) { setError("Loyiha nomi kiritilishi shart"); return; }
    setError('');
    setStep(2);
  };

  const handleCreate = async (skipManager = false) => {
    setSaving(true);
    setError('');
    try {
      const slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const res = await projectsApi.create({
        workspaceId,
        name: name.trim(),
        slug: slug || 'project',
        description: description.trim() || undefined,
        deadline: deadline || undefined,
      });
      const project = (res as { data: ApiProject }).data;

      // Invite manager if selected
      if (!skipManager && managerId) {
        try {
          await projectsApi.inviteMember(project.id, managerId, 'manager');
        } catch {
          // Ignore if invite fails, project still created
        }
      }

      onCreated(project);
    } catch {
      setError("Loyiha yaratishda xatolik");
      setSaving(false);
    }
  };

  const nonOwnerMembers = members.filter((m) => m.role !== 'owner');

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
              <Briefcase className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold">Yangi loyiha</h3>
              <p className="text-xs text-muted-foreground">
                {step === 1 ? 'Asosiy ma\'lumotlar' : 'Loyiha menejerini tanlang'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-xl text-muted-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-0 px-6 py-3 border-b border-border bg-muted/30">
          {[1, 2].map((s) => (
            <div key={s} className="flex items-center">
              <div className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors",
                step === s
                  ? "bg-indigo-600 text-white"
                  : step > s
                    ? "bg-green-500 text-white"
                    : "bg-muted text-muted-foreground border border-border",
              )}>
                {step > s ? <Check className="h-3.5 w-3.5" /> : s}
              </div>
              <span className={cn(
                "ml-2 text-xs font-semibold",
                step === s ? "text-foreground" : "text-muted-foreground",
              )}>
                {s === 1 ? 'Loyiha' : 'Menejer'}
              </span>
              {s < 2 && <div className="mx-3 h-px w-8 bg-border" />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {step === 1 ? (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-semibold">
                  Loyiha nomi <span className="text-rose-500">*</span>
                </label>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && goNext()}
                  placeholder="Masalan: Mobile App v2"
                  className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 transition-all"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold">Tavsif</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Loyiha haqida qisqacha..."
                  rows={3}
                  className="w-full resize-none rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 transition-all"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold">Muddat (deadline)</label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 transition-all"
                />
              </div>
            </>
          ) : (
            <>
              <div className="rounded-xl bg-indigo-50/60 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 p-3 flex items-start gap-3">
                <UserCog className="h-4 w-4 mt-0.5 flex-shrink-0 text-indigo-600 dark:text-indigo-400" />
                <p className="text-xs text-indigo-700 dark:text-indigo-300 leading-5">
                  Loyiha menejerini tanlang. U loyihaga a'zo qo'shish, task berish va hisobotlarni ko'rish huquqiga ega bo'ladi.
                  Bu qadam ixtiyoriy — keyinroq ham qo'shish mumkin.
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold">Jamoa a'zosi</label>
                <select
                  value={managerId}
                  onChange={(e) => setManagerId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 transition-all"
                >
                  <option value="">— Hozircha o'tkazib yuborish —</option>
                  {nonOwnerMembers.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {memberName(m)} ({m.role})
                    </option>
                  ))}
                </select>
              </div>

              {managerId && (
                <div>
                  <label className="mb-1.5 block text-sm font-semibold">Kasbi / Roli</label>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(ROLE_LABELS) as (keyof typeof ROLE_LABELS)[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setManagerRole(r as typeof managerRole)}
                        className={cn(
                          "rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors",
                          managerRole === r
                            ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
                            : "border-border bg-muted text-muted-foreground hover:bg-card",
                        )}
                      >
                        {ROLE_LABELS[r]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {error && (
            <p className="text-xs font-semibold text-rose-500">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 pb-5">
          {step === 2 ? (
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Orqaga
            </button>
          ) : (
            <button type="button" onClick={onClose} className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
              Bekor
            </button>
          )}

          {step === 1 ? (
            <button
              type="button"
              onClick={goNext}
              disabled={!name.trim()}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Keyingisi <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex gap-2">
              {!managerId && (
                <button
                  type="button"
                  onClick={() => handleCreate(true)}
                  disabled={saving}
                  className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
                >
                  O'tkazib yuborish
                </button>
              )}
              <button
                type="button"
                onClick={() => handleCreate(false)}
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Yaratish
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
