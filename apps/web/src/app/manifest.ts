import { appManifest } from "@/lib/appManifest";

// installable-app (#367): served at /manifest.webmanifest, and Next adds
// the <link rel="manifest"> to every page.
export default appManifest;
