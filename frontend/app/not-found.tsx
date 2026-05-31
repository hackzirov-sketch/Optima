'use client';

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Home, Zap } from "lucide-react";

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-100 px-4 text-foreground dark:bg-[#08111F]">
      {/* Background gradients */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_4%,rgba(99,102,241,0.14),transparent_32%),radial-gradient(circle_at_90%_14%,rgba(59,130,246,0.10),transparent_30%)]" />
      <div className="pointer-events-none absolute -left-20 top-24 h-72 w-72 rounded-full bg-indigo-200/30 blur-3xl dark:bg-indigo-500/10" />
      <div className="pointer-events-none absolute -right-16 bottom-10 h-80 w-80 rounded-full bg-blue-200/40 blur-3xl dark:bg-blue-500/10" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative flex flex-col items-center text-center"
      >
        {/* Logo */}
        <Link href="/" className="mb-8 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-500 text-white shadow-lg shadow-indigo-200/60">
            <Zap className="h-5 w-5" />
          </div>
          <span className="text-xl font-black tracking-tight">UPZ</span>
        </Link>

        {/* 404 */}
        <div className="mb-6 text-[120px] font-black leading-none tracking-tight text-indigo-100 dark:text-indigo-950 select-none sm:text-[160px]">
          404
        </div>

        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20">
          Page not found
        </div>

        <h1 className="mb-3 text-3xl font-black tracking-tight sm:text-4xl">
          This page doesn&apos;t exist
        </h1>
        <p className="mb-8 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
          The page you are looking for might have been removed, renamed, or is temporarily unavailable.
        </p>

        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-blue-500 px-6 text-sm font-black text-white shadow-lg shadow-indigo-200/60 transition-all hover:from-indigo-600 hover:to-blue-600 dark:shadow-indigo-950/40"
          >
            <Home className="h-4 w-4" />
            Go home
          </Link>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-border bg-card px-6 text-sm font-bold text-slate-600 shadow-sm transition-all hover:-translate-y-0.5 hover:text-foreground dark:text-slate-400 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Go back
          </button>
        </div>
      </motion.div>
    </main>
  );
}
