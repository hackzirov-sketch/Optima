'use client';

import { Loader2, Trash2, Users } from 'lucide-react';
import { ActionButton, PageHeader, PageShell, SectionTitle, SurfaceCard } from '@/components/app/DesignSystem';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useMembers } from '@/hooks/useMembers';
import { useState } from 'react';

const ROLES = ['guest', 'junior', 'middle', 'senior', 'lead', 'admin'] as const;

function memberDisplayName(member: { user?: { firstName?: string | null; lastName?: string | null; email: string } | null }) {
  if (!member.user) return 'Unknown';
  const full = `${member.user.firstName ?? ''} ${member.user.lastName ?? ''}`.trim();
  return full || member.user.email;
}

export default function WorkspaceMembersPage() {
  const { activeWorkspace } = useWorkspace();
  const { members, loading, refresh, invite, updateRole, removeMember } = useMembers(activeWorkspace?.id);

  const [invEmail, setInvEmail] = useState('');
  const [invRole, setInvRole] = useState('junior');
  const [invSending, setInvSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 2400);
  };

  const handleInvite = async () => {
    if (!invEmail.trim()) return;
    setInvSending(true);
    try {
      await invite(invEmail.trim(), invRole);
      setInvEmail('');
      await refresh();
      showNotice('Taklif yuborildi');
    } catch {
      showNotice('Taklif yuborishda xatolik');
    } finally {
      setInvSending(false);
    }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      await updateRole(userId, role);
      showNotice('Rol yangilandi');
    } catch {
      showNotice('Rolni yangilashda xatolik');
    }
  };

  const handleRemove = async (userId: string) => {
    try {
      await removeMember(userId);
      await refresh();
      showNotice('A\'zo o\'chirildi');
    } catch {
      showNotice('O\'chirishda xatolik');
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
        title="A'zolar"
        description={`${members.length} a'zo`}
      />

      {notice && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl glass px-5 py-3 text-sm font-semibold text-foreground">
          {notice}
        </div>
      )}

      <div className="grid gap-5 max-w-2xl">
        <SurfaceCard>
          <SectionTitle icon={Users} title="Taklif yuborish" description="Email orqali yangi a'zo qo'shing." />
          <div className="flex flex-wrap gap-2">
            <input
              value={invEmail}
              onChange={(e) => setInvEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
              placeholder="colleague@email.com"
              className="min-w-[12rem] flex-1 rounded-2xl border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:bg-card"
            />
            <select
              value={invRole}
              onChange={(e) => setInvRole(e.target.value)}
              className="rounded-2xl border border-border bg-muted px-3 py-2 text-xs font-semibold text-foreground outline-none"
            >
              {ROLES.map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
            </select>
            <ActionButton onClick={handleInvite} disabled={invSending || !invEmail.trim()}>
              {invSending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Taklif'}
            </ActionButton>
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <SectionTitle icon={Users} title="Jamoa" description="Barcha a'zolar va ularning rollari." />
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda…
            </div>
          ) : members.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">{"Hali a'zolar yo'q."}</p>
          ) : (
            <div className="mt-3 space-y-2">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex flex-col gap-2 rounded-2xl border border-border bg-muted p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{memberDisplayName(member)}</p>
                    <p className="truncate text-xs text-muted-foreground">{member.user?.email}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <select
                      value={member.role}
                      onChange={(e) => handleRoleChange(member.userId, e.target.value)}
                      disabled={member.role === 'owner'}
                      className="rounded-xl border border-border bg-card px-2 py-1.5 text-xs font-semibold capitalize outline-none disabled:opacity-60"
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      {member.role === 'owner' && <option value="owner">owner</option>}
                    </select>
                    {member.role !== 'owner' && (
                      <button
                        type="button"
                        onClick={() => handleRemove(member.userId)}
                        className="grid h-8 w-8 place-items-center rounded-xl border border-border text-muted-foreground transition-colors hover:border-rose-300 hover:text-rose-600"
                        aria-label="A'zoni o'chirish"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SurfaceCard>
      </div>
    </PageShell>
  );
}
