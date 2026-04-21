"use client"

import React, { useState, useTransition, useRef, useEffect } from "react"
import { Persona } from "@/domain/entities/Persona"
import { chatWithPersonaAction } from "@/actions/chatWithPersona"
import { useLocalStorage } from "@/ui/hooks/useLocalStorage"
import { Send, Loader2 } from "lucide-react"
import { readStreamableValue } from "@ai-sdk/rsc"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip"

const TAG_REGEX = /<%(.*?)%>/g

function parseMessageContent(content: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  const regex = /<%(.*?)%>/g
  let match = regex.exec(content)

  while (match !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index))
    }

    const inner = match[1]
    const pipeIndex = inner.indexOf('|')
    
    if (pipeIndex !== -1) {
      const displayText = inner.slice(0, pipeIndex).trim()
      const excerpt = inner.slice(pipeIndex + 1).trim()
      parts.push(
        <Tooltip key={`tooltip-${match.index}`} delayDuration={200}>
          <TooltipTrigger asChild>
            <span className="underline underline-offset-2 decoration-dotted cursor-help text-foreground/60 hover:text-foreground transition-colors">
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
    match = regex.exec(content)
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex))
  }

  return parts
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface PersonaChatProps {
  persona: Persona
  isOpen: boolean
  onClose: () => void
}

export function PersonaChat({ persona, isOpen, onClose }: PersonaChatProps) {
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
            return [...prev.slice(0, -1), { role: 'assistant', content: 'Kynd lost the thread here. Let\'s try again.' }]
          }
          return [...prev, { role: 'assistant', content: 'Kynd lost the thread here. Let\'s try again.' }]
        })
      }
    })
  }

  return (
    <TooltipProvider>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-md sm:max-w-lg max-h-[85vh] flex flex-col p-0 gap-0 border-[rgba(26,26,27,0.1)] rounded-2xl">
          <DialogHeader className="px-6 py-4 border-b border-[rgba(26,26,27,0.08)] shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary font-medium text-foreground">
                {persona.name.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <DialogTitle className="text-base" style={{ fontFamily: 'var(--font-fraunces)' }}>{persona.name}</DialogTitle>
                <DialogDescription className="text-xs">{persona.occupation}</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div 
            ref={chatRef}
            className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 custom-scrollbar"
          >
            {messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 text-muted-foreground">
                <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
                  💬
                </div>
                <p className="text-sm max-w-[250px] text-balance">
                  Start a conversation with {persona.name}. Ask them about their thoughts, concerns, or impressions.
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
                    m.role === 'user' ? 'rounded-tr-sm' : 'rounded-tl-sm border border-[rgba(26,26,27,0.08)]'
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
                   className="px-5 py-4 rounded-2xl rounded-tl-sm text-foreground border border-[rgba(26,26,27,0.08)] flex items-center gap-1.5"
                 >
                   <div className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                   <div className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                   <div className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                 </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 bg-card border-t border-[rgba(26,26,27,0.08)] shrink-0">
            <form 
              onSubmit={(e) => {
                e.preventDefault()
                handleSend()
              }}
              className="relative flex items-center"
            >
              <input
                type="text"
                className="w-full h-12 pl-4 pr-12 rounded-xl border-0 border-b-2 border-foreground/20 bg-transparent shadow-none text-sm focus-visible:outline-none focus-visible:ring-0 focus:border-foreground/50 transition-colors placeholder:text-muted-foreground/70"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Message ${persona.name}...`}
                disabled={isPending}
              />
              <button 
                type="submit" 
                disabled={isPending || !input.trim()}
                className="absolute right-1.5 h-9 w-9 flex items-center justify-center rounded-full bg-foreground text-background transition-colors hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none"
              >
                {isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}