import { isServerless } from "./paths.js";

const STORE_NAME = "rialo-latch";
const DB_KEY = "rialo.db";

let storePromise = null;

async function getBlobStore() {
  if (!isServerless()) return null;
  if (!storePromise) {
    storePromise = (async () => {
      try {
        const { getStore } = await import("@netlify/blobs");
        return getStore(STORE_NAME);
      } catch (error) {
        console.error("[blob] getStore failed:", error?.message || error);
        return null;
      }
    })();
  }
  return storePromise;
}

export async function readDbBlob() {
  const store = await getBlobStore();
  if (!store) return null;
  try {
    const ab = await store.get(DB_KEY, { type: "arrayBuffer" });
    return ab ? Buffer.from(ab) : null;
  } catch (error) {
    console.error("[blob] read failed:", error?.message || error);
    return null;
  }
}

export async function writeDbBlob(buffer) {
  const store = await getBlobStore();
  if (!store) return;
  try {
    await store.set(DB_KEY, buffer);
  } catch (error) {
    console.error("[blob] write failed:", error?.message || error);
  }
}
