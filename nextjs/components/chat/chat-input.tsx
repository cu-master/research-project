"use client";

import { useRef, useState, useEffect } from "react";
import { PaperAirplaneIcon, StopIcon } from "@heroicons/react/24/solid";
import type { Attachment } from "@/types/chat";

type Props = {
  placeholder?: string;
  disabled?: boolean;
  isLoading?: boolean;
  onSubmit: (value: string, attachments: Attachment[]) => void;
  onStop?: () => void;
};

export default function ChatInput({ placeholder, disabled, isLoading, onSubmit, onStop }: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-resize textarea to fit content
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    // Reset height to auto so scrollHeight recalculates correctly
    textarea.style.height = "auto";
    // Set height to scrollHeight, capped at maxHeight (200px)
    const maxHeight = 200;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    // Show scrollbar only when content exceeds max height
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  };

  // Adjust height whenever the value changes
  useEffect(() => {
    adjustTextareaHeight();
  }, [value]);

  // Focus textarea when loading finishes (chatbot response complete)
  const prevIsLoadingRef = useRef(isLoading);
  useEffect(() => {
    // Only focus when transitioning from loading (true) to not loading (false)
    if (prevIsLoadingRef.current === true && isLoading === false && textareaRef.current) {
      // Small delay to ensure the UI has updated
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
    prevIsLoadingRef.current = isLoading;
  }, [isLoading]);

  const handleSubmit = () => {
    if (!value.trim()) {
      return;
    }
    onSubmit(value, []);
    setValue("");
    // Reset textarea height after clearing
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.overflowY = "hidden";
    }
    textareaRef.current?.focus();
  };

  const hasContent = Boolean(value.trim());

  return (
    <div className="w-full rounded-[28px] border border-gray-200 bg-gray-50 shadow-sm focus-within:border-gray-300 focus-within:shadow-md transition-all">
      {/* Input Row */}
      <div className="flex w-full items-end gap-2 px-4 py-3">
        <textarea
          id="chat-input"
          ref={textareaRef}
          value={value}
          disabled={isLoading}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder || "How can Grok help?"}
          rows={1}
          style={{ minHeight: "24px", maxHeight: "200px", overflowY: "hidden" }}
          className="flex-1 resize-none border-none bg-transparent px-2 py-1 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 disabled:opacity-50 disabled:cursor-not-allowed leading-6"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !isLoading) {
              event.preventDefault();
              handleSubmit();
            }
          }}
        />

        {isLoading ? (
          <button
            type="button"
            onClick={onStop}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-900 text-white hover:bg-gray-700 transition-colors"
            aria-label="Stop generating"
          >
            <StopIcon className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={disabled || !hasContent}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Send message"
          >
            <PaperAirplaneIcon className="h-4 w-4" />
          </button>
        )}

      </div>
    </div>
  );
}

