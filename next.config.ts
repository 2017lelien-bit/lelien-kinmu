import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Instagram自動投稿の写真ライブラリへのアップロード用(画面側で長辺1440pxのJPEGに縮小して送る。既定の1MBでは足りないことがある)。
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
