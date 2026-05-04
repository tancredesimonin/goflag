// Plain object — we deliberately don't import `defineConfig` here
// because the loader's `tsImport` scope doesn't see the parent
// project's tsconfig path aliases. `defineConfig` is identity, so
// nothing changes at runtime; users in real projects with a
// non-aliased import path can still call it.
const config = {
  baseUrl: "https://ts.example.com",
  framework: "next" as const,
  rules: { "title.length": "off" as const },
};

export default config;
