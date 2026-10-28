import type { AiClient } from '../core/ai/ai.provider';

type AiCallParams = Parameters<NonNullable<AiClient>['call']>[0];

/** Tipo das ferramentas aceitas pelo agente de IA do chat. */
export type ChatTools = NonNullable<NonNullable<AiCallParams['agent']>['tools']>;
