import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { LANGUAGES, applyDir, type LangCode } from "@/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const currentLang = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0];

  const handleChange = (code: LangCode) => {
    i18n.changeLanguage(code);
    applyDir(code);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 font-medium text-muted-foreground hover:text-foreground"
          data-testid="button-language-switcher"
        >
          <Globe className="w-4 h-4" />
          <span className="hidden sm:inline">{currentLang.label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleChange(lang.code)}
            className={`cursor-pointer ${i18n.language === lang.code ? "text-indigo-600 font-semibold bg-indigo-50" : ""}`}
            data-testid={`lang-option-${lang.code}`}
          >
            {lang.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
