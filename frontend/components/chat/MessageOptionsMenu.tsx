import type { CSSProperties } from "react";
import { Copy, Edit, Forward, Pin, Reply, Smile, Trash } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { cn } from "./chatShared";

export type MessageOptionAction = "reply" | "react" | "copy" | "forward" | "pin" | "edit" | "delete";

interface MessageOptionsMenuProps {
  isOwn: boolean;
  onAction: (action: MessageOptionAction) => void;
  className?: string;
  style?: CSSProperties;
}

const BASE_ACTIONS = [
  { action: "reply", labelKey: "reply", icon: Reply },
  { action: "react", labelKey: "react", icon: Smile },
  { action: "copy", labelKey: "copy", icon: Copy },
  { action: "forward", labelKey: "forward", icon: Forward },
  { action: "pin", labelKey: "pin", icon: Pin },
] as const;

export function MessageOptionsMenu({ isOwn, onAction, className, style }: MessageOptionsMenuProps) {
  const { t } = useTranslation();
  const actions = isOwn
    ? [...BASE_ACTIONS, { action: "edit", labelKey: "editOwn", icon: Edit } as const]
    : BASE_ACTIONS;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, y: 3 }}
      transition={{ duration: 0.13, ease: "easeOut" }}
      className={cn(
        "z-50 w-[196px] max-w-[calc(100vw-1rem)] overflow-hidden rounded-[18px] border border-white/80 bg-white/96 p-1.5 text-xs text-gray-900 shadow-2xl shadow-indigo-950/14 backdrop-blur-xl dark:border-gray-700/80 dark:bg-gray-900/96 dark:text-gray-100",
        className,
      )}
      style={style}
      onClick={(event) => event.stopPropagation()}
      role="menu"
      aria-label="Message options"
    >
      {actions.map(({ action, labelKey, icon: Icon }) => (
        <button
          key={action}
          type="button"
          onClick={() => onAction(action)}
          className="flex h-8 w-full items-center gap-2.5 rounded-xl px-2.5 text-left font-medium text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-950 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 dark:text-gray-200 dark:hover:bg-gray-800 dark:hover:text-white"
          aria-label={t(`app.chat.menu.${labelKey}`)}
          role="menuitem"
        >
          <Icon className="h-4 w-4 text-gray-400 dark:text-gray-500" />
          <span className="truncate">{t(`app.chat.menu.${labelKey}`)}</span>
        </button>
      ))}
      <div className="my-1 h-px bg-gray-100 dark:bg-gray-800" />
      <button
        type="button"
        onClick={() => onAction("delete")}
        className="flex h-8 w-full items-center gap-2.5 rounded-xl px-2.5 text-left font-semibold text-rose-600 transition-colors hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-300/40 dark:hover:bg-rose-950/35"
        aria-label={t("app.chat.menu.delete")}
        role="menuitem"
      >
        <Trash className="h-4 w-4" />
        <span className="truncate">{t("app.chat.menu.delete")}</span>
      </button>
    </motion.div>
  );
}
