"use server";

import { cancellationManager } from "@/infrastructure/RequestCancellationManager";

const VPS_BACKEND_URL = process.env.VPS_BACKEND_URL;
const VPS_AUTH_TOKEN = process.env.VPS_AUTH_TOKEN;
const RUN_LOCALLY = process.env.NODE_ENV === "development" || process.env.IS_VPS === "true";

export async function cancelRequestAction(requestId: string): Promise<{ success: boolean; message: string }> {
  if (RUN_LOCALLY) {
    const cancelled = cancellationManager.cancelRequest(requestId);
    return cancelled
      ? { success: true, message: `Request ${requestId} has been cancelled.` }
      : { success: false, message: `No active request found with ID ${requestId}.` };
  }

  const res = await fetch(`${VPS_BACKEND_URL}/api/vps/requests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${VPS_AUTH_TOKEN}`,
    },
    body: JSON.stringify({ requestId }),
  });
  return res.json();
}

export async function getActiveRequestsAction(): Promise<{ requestIds: string[] }> {
  if (RUN_LOCALLY) {
    return { requestIds: cancellationManager.getActiveRequestIds() };
  }

  const res = await fetch(`${VPS_BACKEND_URL}/api/vps/requests`, {
    headers: { Authorization: `Bearer ${VPS_AUTH_TOKEN}` },
  });
  return res.json();
}
