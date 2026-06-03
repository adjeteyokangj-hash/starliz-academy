import path from "node:path";

const config = {
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
      "node:test": path.resolve(process.cwd(), "tests/vitest-node-test-shim.mjs"),
    },
  },
};

export default config;
