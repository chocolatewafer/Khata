/** The path the app is served from: "/" locally, "/Khata/" on GitHub Pages. Always ends with "/". */
export const BASE = import.meta.env.BASE_URL;

/** Turns an in-app route like "/budgets" into a URL that works under BASE. */
export const appUrl = (route: string) => BASE + route.replace(/^\//, '');

/** Absolute URL for links that leave the app (automation apps, shortcuts). */
export const absoluteUrl = (route: string) => location.origin + appUrl(route);
