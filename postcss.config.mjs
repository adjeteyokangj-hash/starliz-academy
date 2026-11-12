import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const config = {
  plugins: {
    "@tailwindcss/postcss": process.env.STARLIZ_WORLD_DB_QA === "1"
      ? { base: join(dirname(fileURLToPath(import.meta.url)), "src") }
      : {},
  },
};

export default config;
