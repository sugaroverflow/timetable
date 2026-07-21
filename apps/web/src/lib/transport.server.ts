import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

import { createTransport } from "@/lib/transport";
import { VIEW_AS_COOKIE } from "@/lib/userPreview";

/** Server adapter at the TransportAuth seam: Clerk request auth and the
 * view-as cookie via next/headers. The closures run per call, so every
 * request reads its own context. */
export const serverTransport = createTransport({
  getToken: async () => {
    const { getToken } = await auth();
    return getToken();
  },
  getViewAs: async () => (await cookies()).get(VIEW_AS_COOKIE)?.value,
});
