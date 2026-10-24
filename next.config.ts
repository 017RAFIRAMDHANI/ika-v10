import type { NextConfig } from "next";
import { resolve } from "node:path";

const humanBrowserBundle = resolve(
  process.cwd(),
  "node_modules/@vladmandic/human/dist/human.esm.js"
);

const nextConfig: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  webpack(config) {
    config.resolve.alias["@vladmandic/human"] = humanBrowserBundle;
    return config;
  }
};

export default nextConfig;
