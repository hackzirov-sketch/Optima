import { useState } from "react";
import { CheckSquare, GitBranch, Lightbulb, MessageSquare, Plus, ShieldCheck, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/app/AppLayout";
import { ActionButton, PageHeader, PageShell, Pill, SectionTitle, SurfaceCard } from "@/components/app/DesignSystem";
import { CommunityRoleIcon, PREMIUM_REACTIONS, PremiumGradientBadge, ReactionButton } from "@/components/premium/PremiumAssets";
import { COMMUNITY_CHANNELS, COMMUNITY_GROUPS, COMMUNITY_THREADS, FEATURED_CREATORS, PROFESSIONAL_COMMUNITIES, SMART_TASKS, WORKSPACE_ZONE } from "@/data/ecosystemData";
import type { UserProfile } from "@/types";

interface Props {
  user: UserProfile;
  onLogout: () => void;
}

const INITIAL_COMMENT_KEYS = ["onboarding", "rituals"];
const COMMUNITY_ASSETS = ["/emojis/laptop.svg", "/emojis/book.svg", "/emojis/rocket.svg", "/emojis/gem.svg", "/emojis/trophy.svg"];

export default function CommunityPage({ user, onLogout }: Props) {
  const { t } = useTranslation();
  const [joinedGroups, setJoinedGroups] = useState(() => COMMUNITY_GROUPS.filter((group) => group.joined).map((group) => group.id));
  const [post, setPost] = useState("");
  const [userComments, setUserComments] = useState<string[]>([]);
  const [convertedThreadId, setConvertedThreadId] = useState(COMMUNITY_THREADS[0]?.id ?? "");

  const toggleGroup = (groupId: string) => {
    setJoinedGroups((current) => (current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId]));
  };

  const publishPost = () => {
    if (!post.trim()) return;
    setUserComments((current) => [post.trim(), ...current]);
    setPost("");
  };

  return (
    <AppLayout user={user} title={t("app.nav.community")} onLogout={onLogout}>
      <PageShell>
        <PageHeader
          eyebrow={t("app.community.eyebrow")}
          title={t("app.community.title")}
          description={t("app.community.description")}
        >
          <ActionButton><Plus className="h-4 w-4" /> {t("app.community.startDiscussion")}</ActionButton>
          <ActionButton variant="secondary"><ShieldCheck className="h-4 w-4" /> {t("app.community.moderationQueue")}</ActionButton>
        </PageHeader>

        <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <SurfaceCard>
            <SectionTitle icon={Users} title={t("app.community.publicGroups")} description={t("app.community.publicGroupsDesc")} />
            <div className="grid gap-3 md:grid-cols-2">
              {COMMUNITY_GROUPS.map((group, index) => {
                const joined = joinedGroups.includes(group.id);
                return (
                  <div key={group.id} className="rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] p-4 transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl bg-white shadow-sm ring-1 ring-[#E5E7EB]">
                          <img src={COMMUNITY_ASSETS[index % COMMUNITY_ASSETS.length]} alt={`${group.profession} icon`} className="h-7 w-7" loading="lazy" decoding="async" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-[#111827]">{t(`app.community.groups.${group.id}.name`, group.name)}</h3>
                          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#6B7280]">{t(`app.community.groups.${group.id}.profession`, group.profession)}</p>
                        </div>
                      </div>
                      <Pill tone={joined ? "green" : "slate"}>{joined ? t("app.community.joined") : t("app.community.public")}</Pill>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[#6B7280]">{t(`app.community.groups.${group.id}.description`, group.description)}</p>
                    <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                      <span className="font-semibold text-[#111827]">{t("app.community.membersCount", { count: group.members.toLocaleString() })}</span>
                      <ActionButton variant={joined ? "secondary" : "primary"} onClick={() => toggleGroup(group.id)} className="py-1.5">
                        {joined ? t("app.community.leave") : t("app.community.join")}
                      </ActionButton>
                    </div>
                  </div>
                );
              })}
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle icon={ShieldCheck} title={t("app.community.moderationUi")} description={t("app.community.moderationDesc")} />
            <div className="space-y-3">
              {COMMUNITY_GROUPS.slice(0, 3).map((group) => (
                <div key={group.id} className="flex items-center justify-between rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] p-3">
                  <div>
                    <p className="text-sm font-semibold text-[#111827]">{t(`app.community.groups.${group.id}.name`, group.name)}</p>
                    <p className="text-xs text-[#6B7280]">{t(`app.community.groups.${group.id}.moderation`, group.moderation)}</p>
                  </div>
                  <ActionButton variant="ghost" className="py-1.5">{t("app.community.review")}</ActionButton>
                </div>
              ))}
            </div>
          </SurfaceCard>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <SurfaceCard className="lg:col-span-2">
            <SectionTitle icon={MessageSquare} title={t("app.community.threadsTitle")} description={t("app.community.threadsDesc")} />
            <div className="space-y-3">
              {COMMUNITY_THREADS.map((thread) => (
                <button key={thread.id} type="button" className="flex w-full items-center justify-between gap-4 rounded-2xl border border-[#E5E7EB] bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm">
                  <span>
                    <span className="block font-semibold text-[#111827]">{t(`app.community.threads.${thread.id}.title`, thread.title)}</span>
                    <span className="mt-1 block text-sm text-[#6B7280]">{t("app.community.startedBy", { author: thread.author, replies: thread.replies })}</span>
                  </span>
                  <Pill tone={thread.status === "Hot" ? "red" : thread.status === "Pinned" ? "indigo" : "slate"}>{t(`app.community.status.${thread.status.toLowerCase()}`)}</Pill>
                </button>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle title={t("app.community.channelsTitle")} description={t("app.community.channelsDesc")} />
            <div className="space-y-3">
              {COMMUNITY_CHANNELS.map((channel) => (
                <div key={channel.id} className="rounded-2xl bg-[#F7FAFC] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[#111827]">{t(`app.community.channels.${channel.id}.name`, channel.name)}</h3>
                    <Pill tone="blue">{t(`app.community.channels.${channel.id}.category`, channel.category)}</Pill>
                  </div>
                  <p className="mt-2 text-xs text-[#6B7280]">{t("app.community.subscribers", { count: channel.subscribers })}</p>
                  <p className="mt-1 text-sm text-[#111827]">{t(`app.community.channels.${channel.id}.last`, channel.last)}</p>
                </div>
              ))}
            </div>
          </SurfaceCard>
        </div>

        <SurfaceCard>
          <SectionTitle
            icon={Lightbulb}
            title={t("app.community.workIntelligenceTitle", "Community work intelligence")}
            description={t("app.community.workIntelligenceDesc", "Turn strong discussions into task previews, project ideas, and moderated action lanes without leaving the social flow.")}
          />
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="grid gap-3 md:grid-cols-2">
              {COMMUNITY_THREADS.slice(0, 4).map((thread, index) => {
                const selected = convertedThreadId === thread.id;
                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => setConvertedThreadId(thread.id)}
                    className={`rounded-[24px] border p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${selected ? "border-indigo-200 bg-indigo-50/60 ring-4 ring-indigo-100" : "border-[#E5E7EB] bg-white"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl bg-white text-indigo-600 shadow-sm ring-1 ring-[#E5E7EB]">
                        <MessageSquare className="h-5 w-5" />
                      </span>
                      <Pill tone={thread.status === "Hot" ? "red" : thread.status === "Pinned" ? "indigo" : "slate"}>{thread.status}</Pill>
                    </div>
                    <h3 className="mt-4 text-sm font-black text-[#111827]">{t(`app.community.threads.${thread.id}.title`, thread.title)}</h3>
                    <p className="mt-2 text-xs leading-5 text-[#6B7280]">{thread.replies} replies analyzed by Optima AI agent {index + 1}</p>
                  </button>
                );
              })}
            </div>
            <div className="rounded-[28px] border border-[#E5E7EB] bg-[#F7FAFC] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-500">Generated work preview</p>
                  <h3 className="mt-2 text-lg font-black text-[#111827]">{SMART_TASKS[0].title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#6B7280]">{SMART_TASKS[0].description}</p>
                </div>
                <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl bg-white text-indigo-600 shadow-sm ring-1 ring-[#E5E7EB]">
                  <CheckSquare className="h-5 w-5" />
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {WORKSPACE_ZONE.spaces.slice(0, 2).map((space) => (
                  <Pill key={space.id} tone="blue"><GitBranch className="mr-1 h-3.5 w-3.5" /> {space.name}</Pill>
                ))}
                <Pill tone="amber">Project idea</Pill>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <ActionButton className="w-full"><CheckSquare className="h-4 w-4" /> Create task</ActionButton>
                <ActionButton variant="secondary" className="w-full"><Lightbulb className="h-4 w-4" /> Save idea</ActionButton>
              </div>
              <div className="mt-4 flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl bg-white/70 p-1.5 ring-1 ring-[#E5E7EB]">
                {PREMIUM_REACTIONS.slice(0, 6).map((reaction) => (
                  <ReactionButton key={reaction.id} asset={reaction} compact onClick={() => setConvertedThreadId(COMMUNITY_THREADS[(COMMUNITY_THREADS.findIndex((thread) => thread.id === convertedThreadId) + 1) % COMMUNITY_THREADS.length]?.id ?? convertedThreadId)} />
                ))}
              </div>
            </div>
          </div>
        </SurfaceCard>

        <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <SurfaceCard>
            <SectionTitle title={t("app.community.networkDepth")} description={t("app.community.networkDepthDesc")} />
            <div className="grid gap-3 sm:grid-cols-2">
              {PROFESSIONAL_COMMUNITIES.map((community, index) => (
                <div key={community.profession} className="rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] p-4">
                  <div className="flex items-center gap-2">
                    <img src={COMMUNITY_ASSETS[index % COMMUNITY_ASSETS.length]} alt={`${community.profession} profession icon`} className="h-7 w-7" loading="lazy" decoding="async" />
                    <h3 className="font-semibold text-[#111827]">{t(`app.community.professional.${index}.profession`, community.profession)}</h3>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#6B7280]">
                    <span>{t("app.community.groupsMetric", { count: community.groups })}</span>
                    <span>{t("app.community.channelsMetric", { count: community.channels })}</span>
                    <span>{t("app.community.mentorsMetric", { count: community.mentors })}</span>
                    <span>{t("app.community.postsMetric", { count: community.weeklyPosts })}</span>
                  </div>
                </div>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle title={t("app.community.featuredCreators")} description={t("app.community.featuredCreatorsDesc")} />
            <div className="space-y-3">
              {FEATURED_CREATORS.map((creator, index) => (
                <div key={creator.name} className="flex items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-50 ring-1 ring-indigo-100">
                      <CommunityRoleIcon role={creator.role} className="h-7 w-7" />
                    </span>
                    <div className="min-w-0">
                    <p className="font-semibold text-[#111827]">{creator.name}</p>
                    <p className="text-sm text-[#6B7280]">{t(`app.community.creators.${index}.role`, creator.role)} - {t(`app.community.creators.${index}.contribution`, creator.contribution)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <PremiumGradientBadge label={t(`app.community.creators.${index}.badge`, creator.badge)} icon="/emojis/trophy.svg" />
                    <p className="mt-2 text-xs font-semibold text-[#6B7280]">{creator.followers}</p>
                  </div>
                </div>
              ))}
            </div>
          </SurfaceCard>
        </div>

        <SurfaceCard>
          <SectionTitle title={t("app.community.postSystem")} description={t("app.community.postSystemDesc")} />
          <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
            <div className="rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] p-4">
              <textarea
                value={post}
                onChange={(event) => setPost(event.target.value)}
                placeholder={t("app.community.postPlaceholder")}
                className="min-h-32 w-full resize-none rounded-2xl border border-[#E5E7EB] bg-white p-4 text-sm text-[#111827] outline-none transition-colors focus:border-indigo-300"
              />
              <div className="mt-3 flex justify-end">
                <ActionButton onClick={publishPost}>{t("app.community.publishPost")}</ActionButton>
              </div>
            </div>
            <div className="space-y-3">
              {userComments.map((comment) => (
                <div key={comment} className="rounded-2xl border border-[#E5E7EB] bg-white p-4 text-sm text-[#111827] shadow-sm">
                  {t("app.community.youPrefix", { text: comment })}
                </div>
              ))}
              {INITIAL_COMMENT_KEYS.map((key) => (
                <div key={key} className="rounded-2xl border border-[#E5E7EB] bg-white p-4 text-sm text-[#111827] shadow-sm">
                  {t(`app.community.initialComments.${key}`)}
                </div>
              ))}
            </div>
          </div>
        </SurfaceCard>
      </PageShell>
    </AppLayout>
  );
}
