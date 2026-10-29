// One JSON record per subscriber in Netlify Blobs (store name nurture-subscribers).
// No extra hosted database. Tests inject a memory store with setStoreForTests.

const STORE = 'nurture-subscribers';

let testStore = null;

function setStoreForTests(store) {
  testStore = store || null;
}

function memoryStore() {
  const map = new Map();
  return {
    async get(key) {
      const row = map.get(key);
      return row ? clone(row.data) : null;
    },
    async getWithMetadata(key) {
      const row = map.get(key);
      if (!row) return null;
      return { data: clone(row.data), etag: String(row.etag) };
    },
    async setJSON(key, data, opts) {
      const row = map.get(key);
      if (opts && opts.onlyIfNew && row) return { modified: false };
      if (opts && opts.onlyIfMatch && (!row || String(row.etag) !== String(opts.onlyIfMatch))) return { modified: false };
      const etag = (row ? row.etag : 0) + 1;
      map.set(key, { data: clone(data), etag });
      return { modified: true, etag: String(etag) };
    },
    async list() {
      return { blobs: [...map.keys()].map((key) => ({ key })) };
    },
  };
}

function blobsConfigured() {
  const ctx = globalThis.netlifyBlobsContext || process.env.NETLIFY_BLOBS_CONTEXT;
  return typeof ctx === 'string' && ctx.length > 0;
}

function wrapBlobs(raw) {
  return {
    async get(key) {
      return raw.get(key, { type: 'json', consistency: 'strong' });
    },
    async getWithMetadata(key) {
      const got = await raw.getWithMetadata(key, { type: 'json', consistency: 'strong' });
      if (!got || got.data == null) return null;
      return { data: got.data, etag: got.etag || '' };
    },
    async setJSON(key, data, opts) {
      const res = await raw.setJSON(key, data, Object.assign({ consistency: 'strong' }, opts || {}));
      if (res && typeof res.modified === 'boolean') return res;
      return { modified: true };
    },
    async list() {
      const page = await raw.list();
      const blobs = (page && page.blobs) || [];
      return { blobs: blobs.map((blob) => ({ key: blob.key })) };
    },
  };
}

async function openStore() {
  if (testStore) return testStore;
  if (!blobsConfigured()) return null;
  const { getStore } = require('@netlify/blobs');
  return wrapBlobs(getStore(STORE, { consistency: 'strong' }));
}

// Read-modify-write with the blob etag, so two sign-ups cannot wipe each other.
async function updateRecord(store, key, mutator) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const got = await store.getWithMetadata(key);
    const current = got ? got.data : null;
    const next = mutator(current);
    if (!next) return { record: current, written: false };
    const opts = got && got.etag ? { onlyIfMatch: String(got.etag) } : { onlyIfNew: true };
    const res = await store.setJSON(key, next, opts);
    if (res && res.modified === false) continue;
    return { record: next, written: true };
  }
  throw new Error('nurture store busy');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  STORE,
  setStoreForTests,
  memoryStore,
  openStore,
  updateRecord,
};
