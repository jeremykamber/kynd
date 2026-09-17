"use server";

import { cancellationManager } from "@/infrastructure/RequestCancellationManager";
import { shouldRunLocally } from "@/infrastructure/config";
import { vpsPost, vpsGet } from "./vpsClient";

/**
 * Cancels an in-flight run: local mode signals the cancellation manager,
 * remote mode POSTs to the VPS. Resolves `success: false` when no matching
 * run exists.
 */
export async function cancelRequestAction(requestId: string): Promise<{ success: boolean; message: string }> {
  if (shouldRunLocally()) {
    const cancelled = cancellationManager.cancelRequest(requestId);
    return cancelled
      ? { success: true, message: `Request ${requestId} has been cancelled.` }
      : { success: false, message: `No active request found with ID ${requestId}.` };
  }

  return vpsPost("requests", { requestId });
}

/** Lists the ids of runs that can currently be cancelled. */
export async function getActiveRequestsAction(): Promise<{ requestIds: string[] }> {
  if (shouldRunLocally()) {
    return { requestIds: cancellationManager.getActiveRequestIds() };
  }

  return vpsGet("requests");
}
