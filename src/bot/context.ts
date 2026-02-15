import { Context, SessionFlavor } from 'grammy';

export interface ProductDraft {
    name?: string;
    category?: string;
    firma?: string;
    code?: string;
    quantity?: number;
    cost_price?: number;
    sale_price?: number;
    currency?: 'UZS' | 'USD';
}

export interface SessionData {
    step: 'idle' | 'confirming' | 'editing' | 'searching';
    draftProduct?: ProductDraft;
    productsToSave?: ProductDraft[]; // For multi-product support
    editingProductId?: number;
    editingField?: string;
}

export type BotContext = Context & SessionFlavor<SessionData>;
