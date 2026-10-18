import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Note: no "standalone" output — the offline launcher uses `next start`
  // from the project root so relative paths (db/, db/uploads/) stay portable.
  // On Vercel the default output is used (standalone is not required).
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Keep native/heavy Node modules outside the webpack bundle so they load
  // from node_modules at runtime (needed for Prisma engines, sharp, pdfjs, etc.
  // in both `next start` and Vercel serverless functions).
  serverExternalPackages: [
    "@prisma/client",
    "prisma",
    "sharp",
    "mammoth",
    "archiver",
    "jszip",
    "unpdf",
    "pdfjs-dist",
    "@vercel/blob",
  ],
};

export default nextConfig;
