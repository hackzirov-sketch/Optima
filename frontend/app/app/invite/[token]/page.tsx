'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { CheckCircle2, Loader2, Users, XCircle } from 'lucide-react';
import { invitationsApi } from '@/lib/api';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAuth } from '@/hooks/useAuth';
import { ActionButton } from '@/components/app/DesignSystem';

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { refreshWorkspaces } = useWorkspace();

  const [status, setStatus] = useState<'confirm' | 'loading' | 'success' | 'declined' | 'error'>('confirm');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!token) return;
    if (!isAuthenticated) {
      sessionStorage.setItem('pending_invite_token', token as string);
      router.push('/auth/login');
    }
  }, [token, isAuthenticated, router]);

  const handleAccept = async () => {
    setStatus('loading');
    try {
      await invitationsApi.accept(token as string);
      await refreshWorkspaces();
      setStatus('success');
      setTimeout(() => router.push('/app/home'), 2000);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Invitation is invalid or has expired.';
      setErrorMsg(msg);
      setStatus('error');
    }
  };

  const handleDecline = async () => {
    setStatus('loading');
    try {
      await invitationsApi.decline(token as string);
    } catch {
      // ignore
    }
    setStatus('declined');
    setTimeout(() => router.push('/app/home'), 2000);
  };

  if (!isAuthenticated) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md rounded-[28px] border border-border bg-card p-8 text-center shadow-modal"
      >
        {status === 'confirm' && (
          <>
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-indigo-50 dark:bg-indigo-950/40">
              <Users className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h1 className="text-xl font-black text-foreground">Workspace invitation</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              You've been invited to join a workspace. Do you want to accept?
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <ActionButton onClick={handleAccept} className="w-full sm:w-auto">
                <CheckCircle2 className="h-4 w-4" /> Accept invitation
              </ActionButton>
              <ActionButton
                variant="secondary"
                onClick={handleDecline}
                className="w-full border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950/30 sm:w-auto"
              >
                <XCircle className="h-4 w-4" /> Decline
              </ActionButton>
            </div>
          </>
        )}

        {status === 'loading' && (
          <>
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-indigo-50 dark:bg-indigo-950/40">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
            <h1 className="text-xl font-black text-foreground">Processing…</h1>
            <p className="mt-2 text-sm text-muted-foreground">Please wait.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-emerald-50 dark:bg-emerald-950/40">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <h1 className="text-xl font-black text-foreground">You've joined the workspace!</h1>
            <p className="mt-2 text-sm text-muted-foreground">Redirecting to your workspace…</p>
            <div className="mx-auto mt-4 h-1.5 w-48 overflow-hidden rounded-full bg-muted">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ duration: 2, ease: 'linear' }}
                className="h-full bg-emerald-500"
              />
            </div>
          </>
        )}

        {status === 'declined' && (
          <>
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-slate-50 dark:bg-slate-900">
              <XCircle className="h-8 w-8 text-slate-400" />
            </div>
            <h1 className="text-xl font-black text-foreground">Invitation declined</h1>
            <p className="mt-2 text-sm text-muted-foreground">Redirecting you home…</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-rose-50 dark:bg-rose-950/40">
              <XCircle className="h-8 w-8 text-rose-600" />
            </div>
            <h1 className="text-xl font-black text-foreground">Invitation failed</h1>
            <p className="mt-2 text-sm text-muted-foreground">{errorMsg}</p>
            <div className="mt-6">
              <ActionButton onClick={() => router.push('/app/home')} className="w-full">
                Go to Home
              </ActionButton>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
