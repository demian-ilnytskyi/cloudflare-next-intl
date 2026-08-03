"use server";

export async function debugTriggerServerError(): Promise<void> {
    console.error("[debug] server-side console.error test");
}
