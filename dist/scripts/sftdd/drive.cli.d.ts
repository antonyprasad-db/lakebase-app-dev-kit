#!/usr/bin/env node
/** The prompt + final reasoning + tool list captured from ONE agent turn, for
 *  the recorder to persist (demo transcript). Not the raw stream (that includes
 *  every interstitial "let me check" delta); just the outcome-level trace. */
interface TurnTranscript {
    /** The task prompt the agent was dispatched with (`claude -p <task>`). */
    prompt: string;
    role?: string;
    model?: string;
    /** The turn's FINAL assistant text (the outcome/rationale). */
    finalText: string;
    /** Each tool action in order (name + a clipped target), as they streamed. */
    tools: string[];
}

export type { TurnTranscript };
