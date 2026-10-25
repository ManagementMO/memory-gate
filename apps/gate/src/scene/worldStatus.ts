/** Whether a world for this visit is still downloading (PhotoWorld sets it). Stepping in waits for one that's on its
 *  way, however slow the connection, instead of drawing a different place from the words. */
export const worldStatus = { loading: false };
