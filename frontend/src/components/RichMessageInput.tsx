import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { emojiAssetUrl, fallbackEmojiImage } from "../lib/emojiAssets";

const TOKEN_PATTERN = /\[\[optima-emoji:(p[1-4]-\d{4})]]/g;

export interface RichMessageInputHandle {
  insertEmoji: (id: string) => void;
  focus: () => void;
}

interface RichMessageInputProps {
  value: string;
  placeholder: string;
  ariaLabel: string;
  maxLength?: number;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

function appendValue(node: Node, output: string[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    output.push(node.textContent || "");
    return;
  }
  if (!(node instanceof HTMLElement)) return;
  if (node.dataset.emojiId) {
    output.push(`[[optima-emoji:${node.dataset.emojiId}]]`);
    return;
  }
  if (node.tagName === "BR") {
    output.push("\n");
    return;
  }
  node.childNodes.forEach((child) => appendValue(child, output));
  if (node.tagName === "DIV" || node.tagName === "P") output.push("\n");
}

function serialize(root: HTMLElement): string {
  const output: string[] = [];
  root.childNodes.forEach((node) => appendValue(node, output));
  return output.join("").replace(/\n{3,}/g, "\n\n").replace(/\n$/, "");
}

function renderValue(root: HTMLElement, value: string) {
  root.replaceChildren();
  let cursor = 0;
  for (const match of value.matchAll(TOKEN_PATTERN)) {
    if (match.index > cursor) root.append(document.createTextNode(value.slice(cursor, match.index)));
    const image = document.createElement("img");
    image.src = emojiAssetUrl(match[1]);
    image.onerror = () => fallbackEmojiImage(image, match[1]);
    image.alt = "emoji";
    image.dataset.emojiId = match[1];
    image.className = "composer-inline-emoji";
    image.contentEditable = "false";
    root.append(image);
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) root.append(document.createTextNode(value.slice(cursor)));
}

export const RichMessageInput = forwardRef<RichMessageInputHandle, RichMessageInputProps>(function RichMessageInput({
  value,
  placeholder,
  ariaLabel,
  maxLength = 1500,
  onChange,
  onSubmit
}, forwardedRef) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastRange = useRef<Range | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || serialize(editor) === value) return;
    renderValue(editor, value);
  }, [value]);

  useImperativeHandle(forwardedRef, () => ({
    focus: () => editorRef.current?.focus(),
    insertEmoji: (id: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      const selection = window.getSelection();
      const range = lastRange.current?.cloneRange() || document.createRange();
      if (!lastRange.current) range.selectNodeContents(editor), range.collapse(false);
      const image = document.createElement("img");
      image.src = emojiAssetUrl(id);
      image.onerror = () => fallbackEmojiImage(image, id);
      image.alt = "emoji";
      image.dataset.emojiId = id;
      image.className = "composer-inline-emoji";
      image.contentEditable = "false";
      range.deleteContents();
      range.insertNode(image);
      range.setStartAfter(image);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
      lastRange.current = range.cloneRange();
      onChange(serialize(editor));
    }
  }), [onChange]);

  function rememberSelection() {
    const selection = window.getSelection();
    if (selection?.rangeCount && editorRef.current?.contains(selection.anchorNode)) {
      lastRange.current = selection.getRangeAt(0).cloneRange();
    }
  }

  return (
    <div
      ref={editorRef}
      className="rich-message-input"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={ariaLabel}
      aria-multiline="true"
      data-placeholder={placeholder}
      onInput={(event) => {
        const editor = event.currentTarget;
        const next = serialize(editor);
        if (next.length <= maxLength) onChange(next);
      }}
      onKeyUp={rememberSelection}
      onMouseUp={rememberSelection}
      onBlur={rememberSelection}
      onPaste={(event) => {
        event.preventDefault();
        const text = event.clipboardData.getData("text/plain").slice(0, maxLength);
        document.execCommand("insertText", false, text);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          onSubmit();
        }
      }}
    />
  );
});
