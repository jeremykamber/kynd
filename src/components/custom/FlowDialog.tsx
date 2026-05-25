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
  transparentOverlay?: boolean
}

export function FlowDialog({
  open,
  onOpenChange,
  title,
  description,
  steps,
  currentStep,
  children,
  transparentOverlay = false
}: FlowDialogProps) {
  /* Overlay-less mode: render as an inline fixed panel so the dashboard remains visible */
  if (transparentOverlay) {
    if (!open) return null
    return (
      <div className="fixed inset-0 z-40 flex items-start justify-center pt-16 pointer-events-none">
        <div className="w-full max-w-2xl mx-auto pointer-events-auto animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="mx-4 rounded-xl border border-border bg-background overflow-hidden">
            <div className="px-8 pt-6 pb-2">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
                <button
                  onClick={() => onOpenChange(false)}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
                >
                  Cancel
                </button>
              </div>
              {description && (
                <p className="text-sm text-muted-foreground mt-1">{description}</p>
              )}
            </div>
            <div className="flex flex-col md:flex-row gap-8 px-8 pb-6 pt-2">
              <div className="flex-shrink-0 w-full md:w-48">
                <StepIndicator steps={steps} currentStep={currentStep} />
              </div>
              <div className="flex-1 min-h-[200px] flex flex-col justify-center items-center">
                {children ? (
                  <div className="w-full">
                    {children}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center space-y-5">
                    <div className="w-48 h-1 bg-muted rounded-sm overflow-hidden">
                      <div className="h-full bg-primary rounded-sm w-1/3 animate-[loading-bar_2s_ease-in-out_infinite]" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground tracking-widest uppercase">
                      Processing
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl gap-8 p-8 md:p-12 border-border rounded-xl bg-background overflow-hidden">
        
        <DialogHeader className="gap-3">
          <DialogTitle className="text-3xl font-semibold tracking-tight text-center">
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription className="text-center text-base text-muted-foreground max-w-md mx-auto text-balance">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        
        <div className="flex flex-col md:flex-row gap-12 relative z-10 py-4">
          <div className="flex-shrink-0 w-full md:w-56 border-r-0 md:border-r border-border/40 pr-0 md:pr-8">
            <StepIndicator 
              steps={steps} 
              currentStep={currentStep} 
            />
          </div>
          
          <div className="flex-1 min-h-[300px] flex flex-col justify-center items-center">
            {children ? (
              <div className="w-full h-full animate-in fade-in zoom-in-95 duration-500">
                {children}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center space-y-6 animate-in fade-in duration-700">
                <div className="w-48 h-1 bg-muted rounded-sm overflow-hidden">
                  <div className="h-full bg-primary rounded-sm w-1/3 animate-[loading-bar_2s_ease-in-out_infinite]" />
                </div>
                <p className="text-sm font-medium text-muted-foreground tracking-widest uppercase">
                  Processing
                </p>
              </div>
            )}
          </div>
        </div>

      </DialogContent>
    </Dialog>
  )
}
