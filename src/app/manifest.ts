import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vokaloom Studio",
    short_name: "Vokaloom",
    description:
      "Bilingual (EN/ES) Content & Voiceover Workstation: 15-Image Aesthetic Background Engine & Realistic AI Voice Studio. / Estación de Contenido y Locución IA: 15 Fondos Estéticos Verticales y Estudio de Voz Neural Realista.",
    start_url: "/",
    display: "standalone",
    background_color: "#060608",
    theme_color: "#060608",
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
