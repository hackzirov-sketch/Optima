import { Code, GraduationCap, UserCircle, Briefcase, Video, Megaphone, PenTool, Users } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";

const PERSONA_ICONS = [Code, GraduationCap, UserCircle, Briefcase, Video, Megaphone, PenTool, Users];

export function ForWhomSection() {
  const { t } = useTranslation();
  const personas = t("forWhom.personas", { returnObjects: true }) as Array<{ role: string; tags: string[] }>;

  return (
    <section id="for-whom" className="bg-white py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <h2 className="mb-4 text-3xl font-bold text-[#111827] md:text-4xl">{t("forWhom.title")}</h2>
          <p className="text-lg text-[#6B7280]">{t("forWhom.subtitle")}</p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {personas.map((persona, i) => {
            const Icon = PERSONA_ICONS[i] ?? Users;
            return (
              <Card key={persona.role} className="h-full border-[#E5E7EB] bg-white">
                <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
                    <Icon className="h-5 w-5 text-indigo-600" />
                  </span>
                  <h3 className="text-lg font-semibold text-[#111827]">{persona.role}</h3>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {persona.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="bg-[#F7FAFC] font-normal text-[#6B7280] hover:bg-[#F7FAFC]">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
