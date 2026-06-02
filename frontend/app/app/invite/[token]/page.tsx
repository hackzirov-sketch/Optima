'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { CheckCircle2, Loader2, Users, XCircle } from 'lucide-react';
import { invitationsApi } from '@/lib/api';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAuth } from '@/hooks/useAuth';

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { refreshWorkspaces } = useWorkspace();

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!token) return;
    if (!isAuthenticated) {
      // Save the invite token and redirect to login
      sessionStorage.setItem('pending_invite_token', token as string);
      router.push('/auth/login');
      return;
    }

    setStatus('loading');
    invitationsApi.accept(token as string)
      .then(async () => {
        await refreshWorkspaces();
        setStatus('success');
        setTimeout(() => router.push('/app/home'), 2000);
      })
      .catch((err) => {
        const msg = err?.message ?? 'Invitation is invalid or has expired.';
        setErrorMsg(msg);
        setStatus('error');
      });
  }, [token, isAuthenticated]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md rounded-[28px] border border-border bg-card p-8 text-center shadow-2xl"
      >
        {status === 'idle' || status === 'loading' ? (
          <>
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-indigo-50 dark:bg-indigo-950/40">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
            <h1 className="text-xl font-black text-foreground">Accepting invitation…</h1>
            <p className="mt-2 text-sm text-muted-foreground">Please wait while we process your invite.</p>
          </>
        ) : status === 'success' ? (
          <>
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-emerald-50 dark:bg-emerald-950/40">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <h1 className="text-xl font-black text-foreground">You&apos;ve joined the workspace!</h1>
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
        ) : (
          <>
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-rose-50 dark:bg-rose-950/40">
              <XCircle className="h-8 w-8 text-rose-600" />
            </div>
            <h1 className="text-xl font-black text-foreground">Invitation failed</h1>
            <p className="mt-2 text-sm text-muted-foreground">{errorMsg}</p>
            <button
              onClick={() => router.push('/app/home')}
              className="mt-6 rounded-2xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-indigo-500"
            >
              Go to Home
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}
