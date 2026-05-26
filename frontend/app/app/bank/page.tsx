'use client';

'use client';

﻿import { CreditCard, DollarSign, Download, Landmark, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/app/AppLayout";
import { ActionButton, MetricTile, PageHeader, PageShell, Pill, SectionTitle, SurfaceCard } from "@/components/app/DesignSystem";
import { BANK_TRANSACTIONS, PAYMENT_METHODS } from "@/data/ecosystemData";
import type { UserProfile } from "@/types";



import { useAuth } from "@/hooks/useAuth";

export default function Page() {
  const { user, logout: onLogout } = useAuth();
  const { t } = useTranslation();

  return (
    <AppLayout user={user} title={t("app.nav.bank")} onLogout={onLogout}>
      <PageShell>
        <PageHeader
          eyebrow={t("app.bank.eyebrow")}
          title={t("app.bank.title")}
          description={t("app.bank.description")}
        >
          <ActionButton><Download className="h-4 w-4" /> {t("app.bank.withdraw")}</ActionButton>
          <ActionButton variant="secondary"><CreditCard className="h-4 w-4" /> {t("app.bank.addMethod")}</ActionButton>
        </PageHeader>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile label={t("app.bank.metrics.balance")} value="$8,420.50" icon={Wallet} trend={t("app.bank.metrics.balanceTrend")} />
          <MetricTile label={t("app.bank.metrics.earnings")} value="$12,860" icon={DollarSign} accent="#10B981" trend={t("app.bank.metrics.earningsTrend")} />
          <MetricTile label={t("app.bank.metrics.payouts")} value="$1,120" icon={Landmark} accent="#F59E0B" trend={t("app.bank.metrics.payoutsTrend")} />
          <MetricTile label={t("app.bank.metrics.crypto")} value="0.018 BTC" icon={CreditCard} accent="#3B82F6" trend={t("app.bank.metrics.cryptoTrend")} />
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <SurfaceCard>
            <SectionTitle icon={Wallet} title={t("app.bank.transactions")} description={t("app.bank.transactionsDesc")} />
            <div className="overflow-hidden rounded-2xl border border-[#E5E7EB]">
              <div className="grid grid-cols-[1fr_140px_120px] gap-3 bg-[#F7FAFC] px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#6B7280] max-sm:hidden">
                <span>{t("app.bank.table.transaction")}</span>
                <span>{t("app.bank.table.amount")}</span>
                <span>{t("app.bank.table.status")}</span>
              </div>
              <div className="divide-y divide-[#E5E7EB] bg-white">
                {BANK_TRANSACTIONS.map((transaction) => {
                  const statusKey = transaction.status.toLowerCase().replace(/\s+/g, "");
                  return (
                    <div key={transaction.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_140px_120px] sm:items-center">
                      <div>
                        <p className="font-semibold text-[#111827]">{t(`app.bank.transactionsData.${transaction.id}.title`, transaction.title)}</p>
                        <p className="mt-1 text-xs text-[#6B7280]">
                          {t(`app.bank.transactionsData.${transaction.id}.type`, transaction.type)} - {t(`app.bank.transactionsData.${transaction.id}.date`, transaction.date)} - {transaction.id}
                        </p>
                      </div>
                      <p className="font-bold text-[#111827]">{transaction.amount}</p>
                      <Pill tone={transaction.status === "Completed" ? "green" : transaction.status === "Processing" ? "amber" : "slate"}>{t(`app.status.${statusKey}`, transaction.status)}</Pill>
                    </div>
                  );
                })}
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle title={t("app.bank.paymentRails")} description={t("app.bank.paymentRailsDesc")} />
            <div className="space-y-3">
              {PAYMENT_METHODS.map((item, index) => {
                const statusKey = item.status.toLowerCase().replace(/\s+/g, "");
                return (
                  <div key={item.name} className="rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[#111827]">{item.name}</p>
                        <p className="mt-1 text-sm leading-6 text-[#6B7280]">
                          {t(`app.bank.paymentMethods.${index}.region`, item.region)} - {t("app.bank.estimatedFee", { fee: t(`app.bank.paymentMethods.${index}.fee`, item.fee) })}
                        </p>
                      </div>
                      <Pill tone={item.status === "Ready UI" ? "green" : item.status === "Demo" ? "blue" : "slate"}>{t(`app.status.${statusKey}`, item.status)}</Pill>
                    </div>
                  </div>
                );
              })}
            </div>
          </SurfaceCard>
        </div>
      </PageShell>
    </AppLayout>
  );
}

