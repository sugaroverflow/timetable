import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Topic",
    short_name: "Topic",
    description: "Collaborative forums — topics, voting, and availability.",
    start_url: "/timetables",
    scope: "/",
    display: "standalone",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
