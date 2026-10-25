import { ConvexError } from 'convex/values';
/** Framework validation errors can echo request arguments. Never put auth in a source card. */
export function sourceError(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data;
    if (typeof data === 'string') return data.slice(0, 300);
    if (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string') return data.message.slice(0, 300);
  }
  if (error instanceof Error && !/\[CONVEX|Server Error|token|ArgumentValidation/i.test(error.message)) return error.message.slice(0, 300);
  return 'This request could not finish. Check the room connection and try again.';
}
