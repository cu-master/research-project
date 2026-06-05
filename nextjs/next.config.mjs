import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained server bundle (.next/standalone) for a lean prod image.
  output: "standalone",
  typedRoutes: true,
  turbopack: {
    root: __dirname
  }
};

export default nextConfig;

