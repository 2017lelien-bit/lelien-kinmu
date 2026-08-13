import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Le lien 勤務管理",
    short_name: "Le lien",
    description: "Le lien 勤務管理・給与計算システム",
    start_url: "/staff/mypage",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#7a2717",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
