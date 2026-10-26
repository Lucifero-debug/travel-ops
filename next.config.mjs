const config = {
  experimental: {
    // Server actions receive form data from these screens only; the
    // default limit is fine, but documents will need raising later.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default config;
