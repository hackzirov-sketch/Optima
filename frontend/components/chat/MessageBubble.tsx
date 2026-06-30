import { useEffect, useRef, useState } from "react"
import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { Pin, Smile } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { ChatMessage, ChatReactionEmoji, ChatRoom, ChatUser } from "@/types"
import { EmojiRenderer, ReactionButton, encodeNativeEmojiReaction, findEmojiAsset, getReactionAsset, normalizeReactionId } from "@/components/premium/PremiumAssets"
import { Avatar, cn, formatMessageTime, getMessageText, getReplySnippet, getUser } from "./chatShared"
import { MessageOptionsMenu, type MessageOptionAction } from "./MessageOptionsMenu"
import { ReactionPicker } from "./ReactionPicker"

interface MessageBubbleProps {
  room: ChatRoom
  message: ChatMessage
  users: ChatUser[]
  replyMessage?: ChatMessage
  isPinned?: boolean
  onReply: (message: ChatMessage) => void
  onEdit: (message: ChatMessage) => void
  onDelete: (messageId: string) => void
  onForward: (message: ChatMessage) => void
  onPin: (messageId: string) => void
  onToggleReaction: (messageId: string, emoji: ChatReactionEmoji) => void
}

type MenuPosition = {
  x: number
  y: number
  anchor: "top" | "bottom"
  align: "left" | "right"
}

function isLargeEmojiOnly(text: string) {
  const withoutAssetTokens = text.replace(/:([a-z0-9-]+):/g, "").trim()
  const assetTokenCount = (text.match(/:([a-z0-9-]+):/g) ?? []).length
  const hasNativeEmoji = /\p{Extended_Pictographic}/u.test(withoutAssetTokens)
  const hasWords = /[A-Za-z0-9]/.test(withoutAssetTokens)
  const visibleLength = Array.from(withoutAssetTokens.replace(/\s/g, "")).length + assetTokenCount
  return visibleLength > 0 && visibleLength <= 4 && !hasWords && (hasNativeEmoji || assetTokenCount > 0)
}

function PremiumMessageText({ text, isOwn, large = false }: { text: string; isOwn: boolean; large?: boolean }) {
  const parts: Array<string | { token: string; key: string }> = []
  const pattern = /:([a-z0-9-]+):/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    const [raw, token] = match
    const asset = findEmojiAsset(token)
    if (!asset) continue

    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    parts.push({ token, key: `${token}-${match.index}` })
    lastIndex = match.index + raw.length
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  if (parts.length === 0) return <>{text}</>

  return (
    <>
      {parts.map((part, index) =>
        typeof part === "string" ? (
          <span key={`text-${index}`}>{part}</span>
        ) : (
          <span
            key={part.key}
            className={cn(
              "mx-0.5 inline-flex translate-y-1 items-center rounded-full p-0.5 align-middle shadow-sm",
              large && "translate-y-0 p-1",
              isOwn ? "bg-card/20" : "bg-muted ring-1 ring-border",
            )}
          >
            <EmojiRenderer assetId={part.token} size={large ? 42 : 22} />
          </span>
        ),
      )}
    </>
  )
}

function calculateMenuPosition(
  clientX: number,
  clientY: number,
  menuWidth: number,
  menuHeight: number
): MenuPosition {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const padding = 12
  const headerHeight = 72
  const footerHeight = 80

  let x: number
  let align: "left" | "right"

  if (clientX + menuWidth + padding > vw) {
    x = Math.max(padding, clientX - menuWidth)
    align = "right"
  } else {
    x = Math.min(vw - menuWidth - padding, clientX)
    align = "left"
  }

  let y: number
  let anchor: "top" | "bottom"

  const spaceBelow = vh - clientY - padding
  const spaceAbove = clientY - headerHeight - padding

  if (spaceBelow > menuHeight + 20 || spaceBelow > spaceAbove) {
    y = Math.min(vh - menuHeight - footerHeight, Math.max(headerHeight + padding, clientY + 8))
    anchor = "bottom"
  } else {
    y = Math.max(headerHeight + padding, clientY - menuHeight - 8)
    anchor = "top"
  }

  return { x, y, anchor, align }
}

export function MessageBubble({
  room,
  message,
  users,
  replyMessage,
  isPinned,
  onReply,
  onEdit,
  onDelete,
  onForward,
  onPin,
  onToggleReaction,
}: MessageBubbleProps) {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerPosition, setPickerPosition] = useState<{ x: number; y: number } | null>(null)
  const [isLongPressing, setIsLongPressing] = useState(false)

  const menuOpenedAtRef = useRef(0)
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null)
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  const isOwn = message.userId === "me"
  const sender = getUser(message.userId, users)
  const showSender = !isOwn && room.type !== "1on1"
  const activeReactionEmojis = message.reactions?.filter((reaction) => reaction.userIds.includes("me")).map((reaction) => normalizeReactionId(reaction.emoji)) ?? []
  const text = getMessageText(message, t)
  const largeEmojiOnly = isLargeEmojiOnly(text)

  // Menyu va pickerni yopish
  const closeAll = () => {
    setMenuOpen(false)
    setMenuPosition(null)
    setPickerOpen(false)
    setPickerPosition(null)
    setIsLongPressing(false)
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  // Escape tugmasi bilan yopish
  useEffect(() => {
    if (!menuOpen && !pickerOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAll()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [menuOpen, pickerOpen])

  // Tashqi bosish va scroll da yopish
  useEffect(() => {
    if (!menuOpen && !pickerOpen) return

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement
      if (target?.closest?.("[data-menu]") || target?.closest?.("[data-picker]")) return
      if (target?.closest?.("[data-message-bubble]")) return
      closeAll()
    }

    const handleScroll = () => {
      closeAll()
    }

    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside)
      document.addEventListener("touchstart", handleClickOutside)
      window.addEventListener("scroll", handleScroll, true)
    }, 50)

    return () => {
      clearTimeout(timer)
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("touchstart", handleClickOutside)
      window.removeEventListener("scroll", handleScroll, true)
    }
  }, [menuOpen, pickerOpen])

  // Menyuni ochish
  const openMenu = (clientX: number, clientY: number) => {
    const menuWidth = 220
    const menuHeight = 280
    const pos = calculateMenuPosition(clientX, clientY, menuWidth, menuHeight)
    setMenuPosition(pos)
    setPickerOpen(false)
    setPickerPosition(null)
    menuOpenedAtRef.current = Date.now()
    setMenuOpen(true)
  }

  // Reaction pickerni ochish
  const openPicker = (event: ReactMouseEvent | ReactTouchEvent) => {
    event.preventDefault()
    event.stopPropagation()
    closeAll()

    const vw = window.innerWidth
    const vh = window.innerHeight
    const pickerWidth = 284
    const pickerHeight = 216
    const headerHeight = 72

    let clientX = vw / 2
    let clientY = vh / 2

    if ('clientX' in event && event.clientX) {
      clientX = event.clientX
      clientY = event.clientY
    } else if ('touches' in event && event.touches.length > 0) {
      clientX = event.touches[0].clientX
      clientY = event.touches[0].clientY
    }

    const pos = calculateMenuPosition(clientX, clientY, pickerWidth, pickerHeight)
    const x = Math.max(10, Math.min(vw - pickerWidth - 10, pos.x))
    const y = Math.max(headerHeight + 10, Math.min(vh - pickerHeight - 10, pos.y))

    setPickerPosition({ x, y })
    setPickerOpen(true)
  }

  // O'ng tugma bosilganda
  const handleContextMenu = (event: ReactMouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (room.type === "saved") return
    openMenu(event.clientX, event.clientY)
  }

  // Touch boshlanganda (long press)
  const handleTouchStart = (event: ReactTouchEvent) => {
    if (room.type === "saved") return
    const touch = event.touches[0]
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    }
    setIsLongPressing(false)

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
    }
    longPressTimerRef.current = setTimeout(() => {
      if (touchStartRef.current) {
        setIsLongPressing(true)
        openMenu(touchStartRef.current.x, touchStartRef.current.y)
        if (navigator.vibrate) navigator.vibrate(10)
      }
      longPressTimerRef.current = null
    }, 500)
  }

  const handleTouchMove = (event: ReactTouchEvent) => {
    if (!touchStartRef.current) return
    const touch = event.touches[0]
    const dx = touch.clientX - touchStartRef.current.x
    const dy = touch.clientY - touchStartRef.current.y
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
      touchStartRef.current = null
      setIsLongPressing(false)
    }
  }

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    touchStartRef.current = null
    setIsLongPressing(false)
  }

  const handleTouchCancel = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    touchStartRef.current = null
    setIsLongPressing(false)
  }

  // Menyu action
  const handleAction = (action: MessageOptionAction) => {
    if (action === "react") {
      closeAll()
      const vw = window.innerWidth
      const vh = window.innerHeight
      const pickerWidth = 284
      const pickerHeight = 216
      const headerHeight = 72
      setPickerPosition({
        x: Math.max(10, Math.round((vw - pickerWidth) / 2)),
        y: Math.max(headerHeight + 10, Math.round((vh - pickerHeight) / 2)),
      })
      setPickerOpen(true)
      return
    }

    closeAll()

    if (action === "reply") onReply(message)
    if (action === "copy") {
      navigator.clipboard?.writeText(text).catch(() => {
        const textarea = document.createElement("textarea")
        textarea.value = text
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand("copy")
        document.body.removeChild(textarea)
      })
    }
    if (action === "forward") onForward(message)
    if (action === "pin") onPin(message.id)
    if (action === "edit" && isOwn) onEdit(message)
    if (action === "delete") onDelete(message.id)
  }

  const handleReaction = (emoji: ChatReactionEmoji) => {
    onToggleReaction(message.id, emoji)
    setPickerOpen(false)
    setPickerPosition(null)
  }

  const handleNativeReaction = (native: string) => {
    onToggleReaction(message.id, encodeNativeEmojiReaction(native))
    setPickerOpen(false)
    setPickerPosition(null)
  }

  // Menyu animatsiyasi
  const getMenuAnimation = () => {
    if (!menuPosition) return {}
    const isTop = menuPosition.anchor === "top"
    const isRight = menuPosition.align === "right"
    return {
      initial: {
        opacity: 0,
        scale: 0.92,
        y: isTop ? -6 : 6,
        x: isRight ? 6 : -6,
      },
      animate: {
        opacity: 1,
        scale: 1,
        y: 0,
        x: 0,
      },
      exit: {
        opacity: 0,
        scale: 0.92,
        y: isTop ? -6 : 6,
      },
    }
  }

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className={cn("flex items-end gap-2.5", isOwn && "flex-row-reverse")}
      >
        {!isOwn && <Avatar user={sender} size={30} />}
        <div className={cn("relative flex max-w-[78%] flex-col sm:max-w-[68%] lg:max-w-[58%]", isOwn ? "items-end" : "items-start")}>
          {showSender && <span className="mb-1 ml-2 text-xs font-medium text-muted-foreground">{sender?.name}</span>}

          <div
            data-message-bubble
            className="group/message relative"
            onContextMenu={handleContextMenu}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchCancel}
          >
            <div
              className={cn(
                "group/bubble relative rounded-[22px] px-4 py-2.5 text-left text-sm leading-relaxed shadow-sm transition-all duration-150",
                "hover:shadow-md",
                largeEmojiOnly && "px-4 py-3 text-4xl leading-tight",
                isOwn
                  ? "rounded-br-md bg-gradient-to-br from-indigo-500 to-blue-500 text-white shadow-indigo-950/25 hover:shadow-indigo-500/25"
                  : "rounded-bl-md border border-border bg-card text-foreground hover:bg-card hover:shadow-indigo-100",
                isLongPressing && "scale-[0.97] opacity-80",
                "cursor-pointer select-none"
              )}
            >
              {replyMessage && (
                <div
                  className={cn(
                    "relative mb-2 overflow-hidden rounded-xl border-l-2 px-3 py-2 text-xs",
                    isOwn ? "border-white/70 bg-card/20 text-white" : "border-indigo-300 bg-indigo-50 text-foreground dark:border-indigo-500/40 dark:bg-indigo-500/15",
                  )}
                >
                  <motion.span
                    aria-hidden="true"
                    animate={{ opacity: [0.35, 0.9, 0.35] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                    className={cn("absolute inset-y-2 left-0 w-0.5 rounded-full", isOwn ? "bg-card" : "bg-indigo-500")}
                  />
                  <div className="font-semibold">{getUser(replyMessage.userId, users)?.name ?? t("app.chat.unknown")}</div>
                  <div className="mt-0.5 line-clamp-2 opacity-80">{getReplySnippet(replyMessage, t)}</div>
                </div>
              )}
              {isPinned && (
                <div className={cn("mb-1.5 flex items-center gap-1 text-[11px] font-semibold", isOwn ? "text-white/75" : "text-indigo-600 dark:text-indigo-400")}>
                  <Pin className="h-3 w-3" />
                  {t("app.chat.pinnedLabel")}
                </div>
              )}
              <div className="whitespace-pre-wrap break-words">
                <PremiumMessageText text={text} isOwn={isOwn} large={largeEmojiOnly} />
              </div>
              <div className={cn("mt-1.5 flex items-center justify-end gap-1 text-[11px]", isOwn ? "text-white/70" : "text-muted-foreground", largeEmojiOnly && "text-xs")}>
                {message.edited && (
                  <span title={message.editedAt ? new Date(message.editedAt).toLocaleString() : undefined}>
                    {t("app.chat.edited", "tahrirlangan")}
                  </span>
                )}
                <span>{formatMessageTime(message.timestamp)}</span>
                {isOwn && <span className={message.read === false ? "text-white/65" : "text-cyan-100"}>{message.read === false ? t("app.chat.sent") : "✓✓"}</span>}
              </div>
            </div>

            {/* Reaksiya tugmasi - hoverda ko'rinadi */}
            <button
              type="button"
              onClick={openPicker}
              onTouchStart={(e) => {
                // Mobile'da ham ishlashi uchun
                e.preventDefault()
                openPicker(e)
              }}
              className={cn(
                "absolute top-1.5 z-10 grid h-7 w-7 place-items-center rounded-full border border-white/70 bg-card/86 text-gray-500 opacity-0 shadow-md shadow-indigo-950/10 backdrop-blur transition-all hover:scale-105 hover:text-indigo-600 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 group-hover/message:opacity-100 dark:border-gray-700 dark:bg-gray-800/88 dark:text-gray-300",
                isOwn ? "left-1.5" : "right-1.5",
              )}
              aria-label="Quick reactions"
            >
              <Smile className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Reaksiyalar */}
          {message.reactions && message.reactions.length > 0 && (
            <div className={cn("mt-1 flex max-w-[min(100%,300px)] flex-wrap gap-1 overflow-visible", isOwn ? "justify-end pr-2" : "justify-start pl-2")}>
              {message.reactions.map((reaction) => {
                const reactionId = normalizeReactionId(reaction.emoji)
                const active = reaction.userIds.includes("me")
                return (
                  <ReactionButton
                    key={reactionId}
                    asset={getReactionAsset(reactionId)}
                    active={active}
                    count={reaction.userIds.length}
                    compact
                    onClick={() => onToggleReaction(message.id, reactionId)}
                  />
                )
              })}
            </div>
          )}
        </div>
      </motion.div>

      {/* Context Menu */}
      {menuOpen && menuPosition && typeof document !== "undefined" && createPortal(
        <div
          data-menu
          className="fixed inset-0 z-[9999] pointer-events-none"
        >
          <motion.div
            ref={menuRef}
            {...getMenuAnimation()}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute pointer-events-auto"
            style={{
              left: menuPosition.x,
              top: menuPosition.y,
              transformOrigin: menuPosition.anchor === "top" ? "top" : "bottom",
            }}
          >
            <MessageOptionsMenu
              isOwn={isOwn}
              onAction={handleAction}
              className="w-[220px] shadow-2xl shadow-black/30"
            />
          </motion.div>
        </div>,
        document.body
      )}

      {/* Reaction Picker */}
      {pickerOpen && pickerPosition && typeof document !== "undefined" && createPortal(
        <div
          data-picker
          ref={pickerRef}
          className="fixed z-[9999] pointer-events-none"
          style={{
            left: pickerPosition.x,
            top: pickerPosition.y,
          }}
        >
          <motion.div
            className="pointer-events-auto"
            initial={{ opacity: 0, scale: 0.85, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 8 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            <ReactionPicker
              activeEmojis={activeReactionEmojis}
              onSelect={handleReaction}
              onSelectNative={handleNativeReaction}
            />
          </motion.div>
        </div>,
        document.body
      )}
    </>
  )
}