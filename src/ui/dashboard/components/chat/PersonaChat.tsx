// @ts-nocheck
"use client"

import { useRef, useEffect, useState, useTransition } from "react"
import { Persona } from "@/domain/entities/Persona"
import { SendIcon, X } from "lucide-react"
import { chatWithPersonaAction } from "@/actions/chatWithPersona"

interface PersonaChatProps {
  persona: Persona
  onClose: () => void
}

export function PersonaChat({ persona, onClose }: PersonaChatProps) {
  const [messages, setMessages] = useState<Array<{ id: string; role: 'user' | 'assistant'; content: string }>>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom when messages update. We intentionally avoid
  // listing `messages` as a dependency to prevent the linter from
  // requiring a stable reference — we only care about when the
  // rendered message list changes length. Disable the exhaustive-deps
  // rule for this line.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  })

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (chatRef.current && !chatRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [onClose])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)

  const [isPending, startTransition] = useTransition()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = (input || "").trim()
    if (!text) return

    // Append user's message
    const userId = `u_${Date.now()}`
    setMessages(prev => [...prev, { id: userId, role: 'user', content: text }])
    setInput("")

    // Start assistant placeholder
    const assistantId = `a_${Date.now()}`
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }])

    setIsLoading(true)

    startTransition(() => {
      // Call server action as part of transition (frontend -> server action -> use case -> adapters)
      chatWithPersonaAction(persona, null, text, messages.map(m => ({ role: m.role, content: m.content })))
        .then(async (result) => {
          const streamData = result?.streamData as AsyncIterable<string> | undefined
          if (!streamData) {
            const final = (result as any)?.text || ''
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: final } : m))
            return
          }

          let buffer = ''
          for await (const chunk of streamData) {
            buffer += chunk
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: buffer } : m))
          }
        })
        .catch(err => {
          console.error('Chat action error', err)
          setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: 'Error: failed to load response.' } : m))
        })
        .finally(() => setIsLoading(false))
    })
  }

  return (
    <div 
      ref={chatRef}
      className="fixed inset-y-0 right-0 w-full md:w-[480px] bg-card border-l border-border shadow-2xl flex flex-col z-[60] animate-in slide-in-from-right duration-500 sm:max-w-md md:max-w-lg lg:max-w-xl pointer-events-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/40 bg-background">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary font-medium text-secondary-foreground">
            {persona.name.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <h3 className="font-semibold text-foreground tracking-tight">{persona.name}</h3>
            <p className="text-xs text-muted-foreground">{persona.occupation}</p>
          </div>
        </div>
        <button 
          type="button"
          onClick={onClose}
          className="p-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close chat"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 custom-scrollbar">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 text-muted-foreground">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
              💬
            </div>
            <p className="text-sm max-w-[250px] text-balance">
              Start a conversation with {persona.name}. Ask them about your product, pricing, or their pain points.
            </p>
          </div>
        ) : (
          messages.map((m: any) => (
            <div 
              key={m.id} 
              className={`flex flex-col max-w-[85%] ${m.role === 'user' ? 'self-end items-end' : 'self-start items-start'}`}
            >
              <div 
                className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  m.role === 'user' 
                    ? 'bg-primary text-primary-foreground rounded-tr-sm' 
                    : 'bg-secondary text-secondary-foreground rounded-tl-sm border border-border/40'
                }`}
              >
                {m.content}
              </div>
              <span className="text-[10px] text-muted-foreground mt-1.5 px-1">
                {m.role === 'user' ? 'You' : persona.name}
              </span>
            </div>
          ))
        )}
        {isLoading && (
          <div className="self-start flex flex-col max-w-[85%] items-start">
             <div className="px-5 py-4 rounded-2xl rounded-tl-sm bg-secondary text-secondary-foreground border border-border/40 flex items-center gap-1.5">
               <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
               <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
               <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-background border-t border-border/40">
        <form 
          onSubmit={handleSubmit}
          className="relative flex items-center"
        >
          <input
            type="text"
            className="w-full h-12 pl-4 pr-12 rounded-full border border-input bg-card shadow-sm text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all placeholder:text-muted-foreground/70"
            value={input ?? ""}
            onChange={handleInputChange}
            placeholder={`Message ${persona.name}...`}
            disabled={isLoading}
          />
          <button 
            type="submit" 
            disabled={isLoading || (input || "").trim().length === 0}
            className="absolute right-1.5 h-9 w-9 flex items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
          >
            <SendIcon className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  )
}
