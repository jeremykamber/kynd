"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { StepIndicator } from "./StepIndicator"

export interface FlowDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  steps: {
    title: string;
    description?: string;
  }[]
  currentStep: number
  children?: React.ReactNode
}

export function FlowDialog({
  open,
  onOpenChange,
  title,
  description,
  steps,
  currentStep,
  children
}: FlowDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl gap-8 p-8 md:p-12 border-[rgba(26,26,27,0.1)] rounded-2xl bg-background shadow-2xl overflow-hidden">
        
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-32 bg-foreground/3 blur-[100px] pointer-events-none rounded-full" />
        
        <DialogHeader className="gap-3">
          <DialogTitle className="text-3xl font-semibold tracking-tight text-center" style={{ fontFamily: 'var(--font-fraunces)' }}>
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription className="text-center text-base text-muted-foreground max-w-md mx-auto text-balance">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        
        <div className="flex flex-col md:flex-row gap-12 relative z-10 py-4">
          <div className="flex-shrink-0 w-full md:w-56 border-r-0 md:border-r border-[rgba(26,26,27,0.08)] pr-0 md:pr-8">
            <StepIndicator 
              steps={steps} 
              currentStep={currentStep} 
            />
          </div>
          
          <div className="flex-1 min-h-[300px] flex flex-col justify-center items-center">
            {children ? (
              <div className="w-full h-full animate-fade-in">
                {children}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center space-y-8 animate-fade-in">
                <div className="relative flex items-center justify-center w-24 h-24">
                  <div className="absolute inset-0 rounded-full border border-foreground/10 animate-[spin_4s_linear_infinite]" />
                  <div className="absolute inset-2 rounded-full border border-foreground/20 border-t-transparent animate-[spin_2s_linear_infinite]" />
                  <div className="absolute inset-4 rounded-full border-2 border-foreground/30 border-b-transparent animate-[spin_1s_linear_infinite]" />
                  <div className="w-4 h-4 rounded-full bg-foreground/40 shadow-[0_0_15px_rgba(26,26,27,0.3)]" />
                </div>
                <p className="text-sm font-medium text-muted-foreground animate-kynd-pulse tracking-widest uppercase">
                  Working
                </p>
              </div>
            )}
          </div>
        </div>

      </DialogContent>
    </Dialog>
  )
}