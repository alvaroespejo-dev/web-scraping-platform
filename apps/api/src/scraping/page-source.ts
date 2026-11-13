/** A loaded page: its final URL and rendered HTML. */
export interface LoadedPage {
  url: string;
  html: string;
}

/**
 * Common abstraction for the static (Axios) and dynamic (Playwright) scrapers.
 * The processor only talks to this interface, so the pagination and extraction logic
 * is the same in both modes.
 */
export interface PageSource {
  open(url: string): Promise<LoadedPage>;
  /** Follows the "next" link/button of the current page. Returns null if there are no more pages. */
  next(current: LoadedPage, nextSelector: string): Promise<LoadedPage | null>;
  close(): Promise<void>;
}

