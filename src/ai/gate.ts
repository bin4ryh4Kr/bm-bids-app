// The public build has no AI features.
import type { ComponentType } from 'react';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Panel = ComponentType<any> | null;
export const AI_ON = false;
export const AiSettings = null as Panel;
export const AiBid = null as Panel;
export const AiReceipt = null as Panel;
export const AiEstimate = null as ComponentType<{ service: string; use: (t: string) => void }> | null;
