"use client";

import React from "react";
import type { DebateMessage } from "@/domain/entities/DebateRoom";

interface DebateMessageBubbleProps {
  message: DebateMessage;
  occupation?: string;
  isStreaming?: boolean;
}

/**
 * Renders one debate message. `isStreaming` swaps in a typing indicator while
 * the message's content is still empty.
 */
export function DebateMessageBubble({
  message,
  occupation,
  isStreaming,
}: DebateMessageBubbleProps) {
  const isUser = message.role === "user";
  const initials = message.personaName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  if (isStreaming && !message.content) {
    return (
      <div className="flex flex-col max-w-2xl self-start items-start">
        <div
          data-testid="typing-indicator"
          className="px-5 py-4 rounded-2xl rounded-tl-sm text-foreground border border-border/40 flex items-center gap-1.5"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" />
          <div className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
          <div className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col max-w-2xl ${
        isUser ? "self-end items-end" : "self-start items-start"
      }`}
    >
      {!isUser && (
        <div className="flex items-center gap-2 mb-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary font-semibold text-xs text-secondary-foreground">
            {initials}
          </div>
          <div className="flex flex-col">
            <span className="text-base font-semibold text-foreground">
              {message.personaName}
            </span>
            {occupation && (
              <span className="text-xs text-muted-foreground">
                {occupation}
              </span>
            )}
          </div>
        </div>
      )}

      <div
        className={`px-5 py-4 rounded-2xl text-base leading-relaxed whitespace-pre-wrap text-foreground ${
          isUser
            ? "rounded-tr-sm bg-primary/10 border border-primary/20"
            : "rounded-tl-sm bg-card border border-border/40"
        }`}
      >
        {message.content || (isStreaming ? "…" : "")}
      </div>

      {isUser && (
        <span className="text-xs text-muted-foreground mt-1 px-1">You</span>
      )}
    </div>
  );
}
