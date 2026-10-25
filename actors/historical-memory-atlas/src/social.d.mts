export type SocialCard = { sourceUrl: string; imageUrl: string; caption: string; owner: string; timestamp: string | null; suggestedObjects: string[]; attribution: string };
export function postUrls(input: unknown): string[];
export function mediaUrl(input: unknown): string | null;
export function suggestObjects(caption: string): string[];
export function normalizePosts(rows: unknown, urls: string[]): SocialCard[];
export function scraperInput(urls: string[]): { directUrls: string[]; resultsType: string; resultsLimit: number; addParentData: boolean };
