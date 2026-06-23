import { clerkMiddleware } from "@clerk/nextjs/server";

// Next 16 renamed the "middleware" convention to "proxy". Clerk attaches auth
// to every request; route-level access control is enforced in layouts/pages
// (public timetables stay readable while anonymous).
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next internals and static files, run on everything else.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpg|jpeg|gif|png|svg|ico|webp|woff2?)).*)",
    "/(api|trpc)(.*)",
  ],
};
