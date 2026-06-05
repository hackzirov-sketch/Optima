'use client';

import { useEffect, useState } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
import { ActionButton, PageHeader, PageShell, SectionTitle, SurfaceCard } from '@/components/app/DesignSystem';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import type { ApiInvitation } from '@/lib/api';

type InvitationStatus = 'pending' | 'expired' | 'accepted' | 'declined';

function getInvitationStatus(inv: ApiInvitation): InvitationStatus {
  if (inv.acceptedAt) return 'accepted';
  if (inv.declinedAt) return 'declined';
  if (new Date(inv.expiresAt) < new Date()) return 'expired';
  return 'pending';
}

const STATUS_STYLE: Record<InvitationStatus, { label: string; className: string }> = {
  pending:  { label: 'Pending',  className: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' },
  expired:  { label: 'Expired',  className: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400' },
  accepted: { label: 'Accepted', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' },
  declined: { label: 'Declined', className: 'bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400' },
};

const ROLES = ['guest', 'junior', 'middle', 'senior', 'lead', 'admin'] as const;

export default function WorkspaceInvitesPage() {
  const { activeWorkspace } = useWorkspace();

  const [invitations, setInvitations] = useState<ApiInvitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('junior');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 2400);
  };

  const loadInvitations = async () => {
    if (!activeWorkspace?.id) return;
    setLoading(true);
    const { workspacesApi } = await import('@/lib/api');
    workspacesApi.listInvitations(activeWorkspace.id)
      .then((res) => setInvitations(res?.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadInvitations(); }, [activeWorkspace?.id]);

  const handleSend = async () => {
    if (!email.trim() || !activeWorkspace) return;
    setSending(true);
    try {
      const { workspacesApi } = await import('@/lib/api');
      await workspacesApi.invite(activeWorkspace.id, email.trim(), role);
      await loadInvitations();
      setEmail('');
      showNotice('Taklif yuborildi');
    } catch {
      showNotice('Taklif yuborishda xatolik yuz berdi');
    } finally {
      setSending(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!activeWorkspace) return;
    const { workspacesApi } = await import('@/lib/api');
    await workspacesApi.cancelInvitation(activeWorkspace.id, id).catch(() => {});
    setInvitations((prev) => prev.filter((inv) => inv.id !== id));
  };

  if (!activeWorkspace) {
    return (
      <PageShell>
        <p className="py-12 text-center text-sm text-muted-foreground">Faol workspace tanlanmagan.</p>
      </PageShell>
    );
  }

  const pending = invitations.filter((inv) => getInvitationStatus(inv) === 'pending');
  const others = invitations.filter((inv) => getInvitationStatus(inv) !== 'pending');

  return (
    <PageShell>
      <PageHeader
        eyebrow={activeWorkspace.name}
        title="Takliflar"
        description={`${pending.length} kutilmoqda · ${invitations.length} jami`}
      />

      {notice && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-foreground px-5 py-3 text-sm font-semibold text-background shadow-lg">
          {notice}
        </div>
      )}

      <div className="grid gap-5 max-w-2xl">
        {/* Invite form */}
        <SurfaceCard>
          <SectionTitle icon={UserPlus} title="Yangi taklif" description="Email orqali jamoa a'zosini qo'shing." />
          <div className="flex gap-2">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="colleague@email.com"
              className="min-w-0 flex-1 rounded-2xl border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-400 focus:bg-card"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="rounded-2xl border border-border bg-muted px-3 py-2 text-xs font-semibold text-foreground outline-none"
            >
              {ROLES.map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
            </select>
            <ActionButton onClick={handleSend} disabled={sending || !email.trim()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Yuborish'}
            </ActionButton>
          </div>
        </SurfaceCard>

        {/* Pending invitations */}
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda…
          </div>
        ) : (
          <>
            {pending.length > 0 && (
              <SurfaceCard>
                <SectionTitle icon={UserPlus} title="Kutilayotgan takliflar" description="Hali qabul qilinmagan." />
                <div className="space-y-2">
                  {pending.map((inv) => {
                    const status = getInvitationStatus(inv);
                    const style = STATUS_STYLE[status];
                    return (
                      <div key={inv.id} className="flex items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold text-foreground">{inv.email}</p>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${style.className}`}>{style.label}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground capitalize">
                            {inv.role} · Expires {new Date(inv.expiresAt).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          onClick={() => handleCancel(inv.id)}
                          className="shrink-0 rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-rose-300 hover:text-rose-600"
                        >
                          Bekor
                        </button>
                      </div>
                    );
                  })}
                </div>
              </SurfaceCard>
            )}

            {others.length > 0 && (
              <SurfaceCard>
                <SectionTitle icon={UserPlus} title="Tarix" description="Qabul qilingan, rad etilgan yoki muddati o'tgan." />
                <div className="space-y-2">
                  {others.map((inv) => {
                    const status = getInvitationStatus(inv);
                    const style = STATUS_STYLE[status];
                    return (
                      <div key={inv.id} className="flex items-center gap-3 rounded-2xl bg-muted px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold text-foreground">{inv.email}</p>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${style.className}`}>{style.label}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground capitalize">
                            {inv.role} · {new Date(inv.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SurfaceCard>
            )}

            {invitations.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">Hech qanday taklif yo'q.</p>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}
