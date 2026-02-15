import { Context, SessionFlavor } from 'grammy';

export interface ProductDraft {
    name?: string;
    category?: string;
    code?: string;
    quantity?: number;
    cost_price?: number;
    sale_price?: number;
}

export interface SessionData {
    step: 'idle' | 'confirming' | 'editing' | 'searching';
    draftProduct?: ProductDraft;
    productsToSave?: ProductDraft[]; // For multi-product support
    editingField?: keyof ProductDraft;
}

export type BotContext = Context & SessionFlavor<SessionData>;
