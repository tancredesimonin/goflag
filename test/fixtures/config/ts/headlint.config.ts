// Plain object — keeps the fixture self-contained without
// importing `defineConfig` (the loader's tsImport scope can't see
// the parent project's tsconfig path aliases anyway).
const config = {
  baseUrl: "https://ts.example.com",
  framework: "next",
  rules: { "title.length": "off" },
};

export default config;
