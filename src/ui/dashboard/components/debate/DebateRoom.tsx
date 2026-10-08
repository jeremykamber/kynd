"use client";

import React, { useState, useRef, useEffect } from "react";
import { useDebateStore } from "@/ui/stores/debateStore";
import { DebateMessageBubble } from "./DebateMessageBubble";
import { Send, CopyIcon, CheckIcon, MessageSquareIcon, PlusIcon } from "lucide-react";

/**
 * Active-debate view: messages grouped by round plus an interjection box.
 * Reads the debate matching `activeDebateId` from the debate store and appends
 * user interjections directly to it. When no debate is active, renders the
 * workspace empty state and offers `onNewDebate` as its call to action.
 */
export function DebateRoom({ onNewDebate }: { onNewDebate?: () => void }) {
  const debates = useDebateStore((s) => s.debates);
  const activeDebateId = useDebateStore((s) => s.activeDebateId);
  const isStreaming = useDebateStore((s) => s.isStreaming);
  const activeDebate = debates.find((d) => d.id === activeDebateId);

  const [input, setInput] = useState("");
  const [copied, setCopied] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [activeDebate?.messages]);

  if (!activeDebate) {
    const isEmpty = debates.length === 0;
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
        <div className="flex w-full max-w-sm flex-col items-center gap-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
            <MessageSquareIcon className="h-7 w-7 text-muted-foreground" />
          </div>
          <div className="flex flex-col gap-2">
            {isEmpty && (
              <h2 className="text-lg font-semibold tracking-tight leading-snug">
                No debates yet
              </h2>
            )}
            <p className="text-sm leading-relaxed text-muted-foreground">
              Select a debate or start a new one
            </p>
          </div>
          {isEmpty && onNewDebate && (
            <button
              type="button"
              onClick={onNewDebate}
              className="inline-flex h-9 w-fit items-center gap-2 rounded-md bg-primary/10 px-4 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
            >
              <PlusIcon className="h-4 w-4" />
              New Debate
            </button>
          )}
        </div>
      </div>
    );
  }

  const handleCopyTranscript = async () => {
    const transcript = activeDebate.messages
      .map((m) => `[${m.personaName}]: ${m.content}`)
      .join("\n\n");
    await navigator.clipboard.writeText(transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInterject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !activeDebateId) return;
    useDebateStore.getState().addMessage(activeDebateId, {
      id: crypto.randomUUID(),
      personaId: "user",
      personaName: "You",
      role: "user",
      round: activeDebate.currentRound,
      content: input.trim(),
      order: activeDebate.messages.length,
    });
    setInput("");
  };

  const messagesByRound = activeDebate.messages.reduce<
    Record<number, typeof activeDebate.messages>
  >((acc, msg) => {
    if (!acc[msg.round]) acc[msg.round] = [];
    acc[msg.round].push(msg);
    return acc;
  }, {});

  const getPersona = (personaId: string) =>
    activeDebate.participants.find((p) => p.id === personaId);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="shrink-0 px-6 py-4 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-base font-semibold tracking-tight">
              {activeDebate.proposal}
            </h2>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="font-mono tabular-nums">
                Round {activeDebate.currentRound} of {activeDebate.totalRounds}
              </span>
              <span>·</span>
              <span>
                {activeDebate.participants.map((p) => p.name).join(" · ")}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyTranscript}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/40 px-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {copied ? (
                <>
                  <CheckIcon className="h-3.5 w-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <CopyIcon className="h-3.5 w-3.5" />
                  Copy
                </>
              )}
            </button>
          </div>
        </div>

        <div className="mt-3 flex gap-1">
          {Array.from({ length: activeDebate.totalRounds }, (_, i) => {
            const roundNum = i + 1;
            const isCompleted = roundNum < activeDebate.currentRound;
            const isCurrent = roundNum === activeDebate.currentRound;
            return (
              <div
                key={roundNum}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  isCompleted
                    ? "bg-primary"
                    : isCurrent
                      ? "bg-primary/50"
                      : "bg-muted"
                }`}
              />
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 custom-scrollbar">
        {Object.entries(messagesByRound).map(([roundStr, messages]) => {
          const roundNum = Number(roundStr);
          return (
            <div key={roundStr} className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="micro-label text-muted-foreground">
                  Round {roundNum}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              {messages.map((msg) => {
                const persona = msg.personaId !== "user"
                  ? getPersona(msg.personaId)
                  : undefined;
                return (
                  <DebateMessageBubble
                    key={msg.id}
                    message={msg}
                    occupation={persona?.occupation}
                    isStreaming={
                      isStreaming &&
                      msg === activeDebate.messages[activeDebate.messages.length - 1] &&
                      !msg.content
                    }
                  />
                );
              })}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {activeDebate.status === "in_progress" && (
        <div className="shrink-0 px-6 py-4 border-t border-border/40 bg-card">
          <form
            onSubmit={handleInterject}
            className="relative flex items-center"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Add your perspective (interjects into the debate)..."
              disabled={isStreaming}
              className="w-full h-11 pl-4 pr-12 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all placeholder:text-muted-foreground/70 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="absolute right-1.5 h-8 w-8 flex items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
