import { lazy } from 'react';
import { Capacitor } from '@capacitor/core';

// AI here runs on the phone itself (llama.cpp inside the app), so it only exists in the phone apps.
// In a browser the AI panels are left out entirely.
export const AI_ON = Capacitor.isNativePlatform();
export const AiSettings = AI_ON ? lazy(() => import('./panels').then(m => ({ default: m.AiSettings }))) : null;
export const AiBid = AI_ON ? lazy(() => import('./panels').then(m => ({ default: m.AiBid }))) : null;
export const AiReceipt = AI_ON ? lazy(() => import('./panels').then(m => ({ default: m.AiReceipt }))) : null;
export const AiEstimate = AI_ON ? lazy(() => import('./panels').then(m => ({ default: m.AiEstimate }))) : null;
