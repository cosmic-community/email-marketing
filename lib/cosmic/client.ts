import { createBucketClient } from "@cosmicjs/sdk";

if (
  !process.env.COSMIC_BUCKET_SLUG ||
  !process.env.COSMIC_READ_KEY ||
  !process.env.COSMIC_WRITE_KEY
) {
  throw new Error("Missing required Cosmic environment variables");
}

// Create the Cosmic client and export it
export const cosmic = createBucketClient({
  bucketSlug: process.env.COSMIC_BUCKET_SLUG,
  readKey: process.env.COSMIC_READ_KEY,
  writeKey: process.env.COSMIC_WRITE_KEY,
});

