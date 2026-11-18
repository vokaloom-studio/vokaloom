import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vokaloom Studio",
    short_name: "Vokaloom",
    description:
      "High-speed Content & Voiceover Fulfillment Workstation: 15-Image Aesthetic Background Engine & Realistic AI Voice Studio.",
    start_url: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#09090b",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
