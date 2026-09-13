/**
 * Global request cancellation manager.
 * Tracks active LLM requests and allows cancelling them via AbortController.
 * This prevents tokens from being wasted on requests the user wants to stop.
 */

interface ActiveRequest {
  id: string;
  controller: AbortController;
  createdAt: number;
}

class RequestCancellationManager {
  private activeRequests: Map<string, ActiveRequest> = new Map();

  /**
   * Create a new tracked request with its own AbortController.
   */
  createRequest(requestId: string): AbortController {
    const controller = new AbortController();
    this.activeRequests.set(requestId, {
      id: requestId,
      controller,
      createdAt: Date.now(),
    });
    console.log(`[RequestCancellation] Created request: ${requestId}`);
    return controller;
  }

  /**
   * Cancel a specific request by ID.
   */
  cancelRequest(requestId: string): boolean {
    const request = this.activeRequests.get(requestId);
    if (!request) {
      console.log(`[RequestCancellation] No active request found: ${requestId}`);
      return false;
    }

    request.controller.abort();
    this.activeRequests.delete(requestId);
    console.log(`[RequestCancellation] Cancelled request: ${requestId}`);
    return true;
  }

  /**
   * Clean up a request after it completes.
   */
  clearRequest(requestId: string): void {
    this.activeRequests.delete(requestId);
  }

  /**
   * Get all active request IDs.
   */
  getActiveRequestIds(): string[] {
    return Array.from(this.activeRequests.keys());
  }
}

export const cancellationManager = new RequestCancellationManager();
