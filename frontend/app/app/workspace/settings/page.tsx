'use client';

import { useEffect, useState } from 'react';
import { Loader2, Settings, Trash2 } from 'lucide-react';
import { ActionButton, Modal, PageHeader, PageShell, SectionTitle, SurfaceCard } from '@/components/app/DesignSystem';
import { useWorkspace } from '@/contexts/WorkspaceContext';

export default function WorkspaceSettingsPage() {
  const { activeWorkspace, updateWorkspace, deleteWorkspace, refreshWorkspaces } = useWorkspace();

  const [wsName, setWsName] = useState(activeWorkspace?.name ?? '');
  const [wsDesc, setWsDesc] = useState(activeWorkspace?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setWsName(activeWorkspace?.name ?? '');
    setWsDesc(activeWorkspace?.description ?? '');
  }, [activeWorkspace?.id]);

  const handleSave = async () => {
    if (!activeWorkspace || !wsName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await updateWorkspace(activeWorkspace.id, {
        name: wsName.trim(),
        description: wsDesc.trim() || undefined,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError('Saqlashda xatolik yuz berdi');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!activeWorkspace) return;
    setDeleting(true);
    try {
      await deleteWorkspace(activeWorkspace.id);
      await refreshWorkspaces();
      setDeleteOpen(false);
    } catch {
      setError('O\'chirishda xatolik yuz berdi');
    } finally {
      setDeleting(false);
    }
  };

  if (!activeWorkspace) {
    return (
      <PageShell>
        <p className="py-12 text-center text-sm text-muted-foreground">Faol workspace tanlanmagan.</p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow={activeWorkspace.name}
        title="Workspace settings"
        description="Nomini, tavsifini o'zgartirish yoki workspaceni o'chirish."
      />

      <div className="grid gap-5 max-w-2xl">
        <SurfaceCard>
          <SectionTitle icon={Settings} title="Asosiy ma'lumotlar" description="Workspace nomi va tavsifini yangilang." />
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Nomi</label>
              <input
                value={wsName}
                onChange={(e) => setWsName(e.target.value)}
                className="w-full rounded-2xl border border-border bg-muted px-4 py-2.5 text-sm text-foreground outline-none focus:border-indigo-400 focus:bg-card"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Tavsif</label>
              <textarea
                value={wsDesc}
                onChange={(e) => setWsDesc(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-2xl border border-border bg-muted px-4 py-2.5 text-sm text-foreground outline-none focus:border-indigo-400 focus:bg-card"
              />
            </div>
            {error && (
              <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">{error}</p>
            )}
            <div className="flex items-center gap-3">
              <ActionButton onClick={handleSave} disabled={saving || !wsName.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Saqlash'}
              </ActionButton>
              {saved && <span className="text-sm font-semibold text-emerald-600">Saqlandi ✓</span>}
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <SectionTitle icon={Trash2} title="Xavfli zona" description="Bu amalni qaytarib bo'lmaydi." />
          <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 dark:border-rose-900/40 dark:bg-rose-950/20">
            <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">{"Workspaceni o'chirish"}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{"Barcha loyihalar, vazifalar va a'zolar butunlay o'chib ketadi."}</p>
            <button
              onClick={() => setDeleteOpen(true)}
              className="mt-3 rounded-xl border border-rose-300 bg-rose-100 px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-200 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-400"
            >
              {"O'chirish"}
            </button>
          </div>
        </SurfaceCard>
      </div>

      <Modal
        open={deleteOpen}
        title="Workspaceni o'chirish"
        description={`"${activeWorkspace.name}" o'chirilsinmi? Bu amal qaytarilmaydi.`}
        onClose={() => setDeleteOpen(false)}
      >
        <div className="space-y-4">
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-500/10 dark:text-rose-400">
            {"Barcha loyihalar, vazifalar va a'zolar butunlay o'chib ketadi."}
          </p>
          <div className="flex justify-end gap-3">
            <ActionButton variant="secondary" onClick={() => setDeleteOpen(false)}>Bekor</ActionButton>
            <ActionButton variant="danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'O\'chirish'}
            </ActionButton>
          </div>
        </div>
      </Modal>
    </PageShell>
  );
}
