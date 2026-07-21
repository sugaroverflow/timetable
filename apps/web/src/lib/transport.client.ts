import { getClerkToken } from "@/lib/clientAuth";
import { createTransport } from "@/lib/transport";
import { VIEW_AS_COOKIE } from "@/lib/userPreview";

/** Browser adapter at the TransportAuth seam: Clerk's window bundle and
 * document.cookie. */
export const clientTransport = createTransport({
  getToken: getClerkToken,
  getViewAs: async () => {
    if (typeof document === "undefined") return undefined;
    const match = document.cookie.match(
      new RegExp(`(?:^|; )${VIEW_AS_COOKIE}=([^;]+)`),
    );
    return match?.[1] ? decodeURIComponent(match[1]) : undefined;
  },
});
