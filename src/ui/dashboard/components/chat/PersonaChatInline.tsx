"use client"

import React, { useState, useTransition, useRef, useEffect } from "react"
import { Persona } from "@/domain/entities/Persona"
import { chatWithPersonaAction } from "@/actions/chatWithPersona"
import { useLocalStorage } from "@/ui/hooks/useLocalStorage"
import { Send, Loader2 } from "lucide-react"
import { readStreamableValue } from "@ai-sdk/rsc"
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip"
import { ThinkingBlock } from "@/components/custom/ThinkingBlock"
import { ScrollArea } from "@/components/ui/scroll-area"

const TAG_REGEX = /<%(.*?)%>/g
const REASONING_REGEX = new RegExp("<<REASONING>>([\\s\\S]*?)<</REASONING>>", "g")

function parseMessageContent(content: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let lastIndex = 0

  const reasoningMatch = content.match(REASONING_REGEX)
  let textWithoutReasoning = content.replace(REASONING_REGEX, "").trim()

  if (reasoningMatch) {
    const reasoningText = reasoningMatch[0].replace("<<REASONING>>", "").replace("<</REASONING>>", "").trim()
    parts.push(
      <ThinkingBlock key="reasoning" content={reasoningText} className="mb-3" />
    )
  }

  if (!textWithoutReasoning) return parts

  const regex = /<%(.*?)%>/g
  let match = regex.exec(textWithoutReasoning)

  while (match !== null) {
    if (match.index > lastIndex) {
      parts.push(textWithoutReasoning.slice(lastIndex, match.index))
    }

    const inner = match[1]
    const pipeIndex = inner.indexOf('|')

    if (pipeIndex !== -1) {
      const displayText = inner.slice(0, pipeIndex).trim()
      const excerpt = inner.slice(pipeIndex + 1).trim()
      parts.push(
        <Tooltip key={`tooltip-${match.index}`} delayDuration={200}>
          <TooltipTrigger asChild>
            <span className="underline underline-offset-2 decoration-dotted cursor-help text-primary/80 hover:text-primary">
              {displayText}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[280px] text-xs">
            <p>{excerpt}</p>
          </TooltipContent>
        </Tooltip>
      )
    } else {
      parts.push(match[0])
    }

    lastIndex = match.index + match[0].length
    match = regex.exec(textWithoutReasoning)
  }

  if (lastIndex < textWithoutReasoning.length) {
    parts.push(textWithoutReasoning.slice(lastIndex))
  }

  return parts
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface PersonaChatInlineProps {
  persona: Persona
}

export function PersonaChatInline({ persona }: PersonaChatInlineProps) {
  const storageKey = `persona_chat_${persona.id}`
  const [messages, setMessages] = useLocalStorage<Message[]>(storageKey, [])
  const [input, setInput] = useState("")
  const [isPending, startTransition] = useTransition()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  })

  const handleSend = (overrideMessage?: string) => {
    const messageToSend = (overrideMessage || input).trim()
    if (!messageToSend || isPending) return

    setInput("")
    const newMessages: Message[] = [...messages, { role: 'user', content: messageToSend }]
    setMessages(newMessages)

    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    startTransition(async () => {
      try {
        const { streamData } = await chatWithPersonaAction(
          persona,
          null,
          messageToSend,
          messages
        )

        for await (const content of readStreamableValue(streamData)) {
          if (content) {
            setMessages((prev) => {
              const last = prev[prev.length - 1]
              if (last && last.role === 'assistant') {
                return [...prev.slice(0, -1), { role: 'assistant', content }]
              }
              return prev
            })
          }
        }
      } catch (error) {
        console.error('Chat error:', error)
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last && last.role === 'assistant' && last.content === '') {
            return [...prev.slice(0, -1), { role: 'assistant', content: 'Connection lost. Please try again.' }]
          }
          return [...prev, { role: 'assistant', content: 'Connection lost. Please try again.' }]
        })
      }
    })
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full">
        <div
          ref={chatRef}
          className="flex-1 overflow-y-auto p-5 flex flex-col gap-5 custom-scrollbar"
        >
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 text-muted-foreground">
              <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center text-xl">
                💬
              </div>
              <p className="text-sm max-w-[250px] text-balance">
                Start a conversation with {persona.name}. Ask them about your product, pricing, or their pain points.
              </p>
            </div>
          ) : (
            messages.map((m, i) => (
              <div
                key={`${m.role}-${i}`}
                className={`flex flex-col max-w-[85%] ${m.role === 'user' ? 'self-end items-end' : 'self-start items-start'}`}
              >
                <div
                  style={{
                    backgroundColor: m.role === 'user'
                      ? 'var(--chat-user-bubble)'
                      : 'var(--chat-assistant-bubble)',
                  }}
                  className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap text-foreground ${
                    m.role === 'user' ? 'rounded-tr-sm' : 'rounded-tl-sm border border-border/40'
                  }`}
                >
                  {parseMessageContent(m.content)}
                </div>
                <span className="text-[10px] text-muted-foreground mt-1.5 px-1">
                  {m.role === 'user' ? 'You' : persona.name}
                </span>
              </div>
            ))
          )}
          {isPending && (
            <div className="self-start flex flex-col max-w-[85%] items-start">
               <div
                 style={{ backgroundColor: 'var(--chat-assistant-bubble)' }}
                 className="px-5 py-4 rounded-2xl rounded-tl-sm text-foreground border border-border/40 flex items-center gap-1.5"
               >
                 <div className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-[fade-in-out_1.4s_ease-in-out_infinite]" style={{ animationDelay: '0ms' }} />
                 <div className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-[fade-in-out_1.4s_ease-in-out_infinite]" style={{ animationDelay: '467ms' }} />
                 <div className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-[fade-in-out_1.4s_ease-in-out_infinite]" style={{ animationDelay: '933ms' }} />
               </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 bg-card border-t border-border/40 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSend()
            }}
            className="relative flex items-center"
          >
            <input
              type="text"
              className="w-full h-12 pl-4 pr-12 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all placeholder:text-muted-foreground/70"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Message ${persona.name}...`}
              disabled={isPending}
            />
            <button
              type="submit"
              disabled={isPending || !input || !input.trim()}
              className="absolute right-1.5 h-9 w-9 flex items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
            >
              {isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </form>
        </div>
      </div>
    </TooltipProvider>
  )
}
