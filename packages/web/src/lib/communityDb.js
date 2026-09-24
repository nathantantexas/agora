/**
 * On-device storage for posts written here, and for the photos and video attached to
 * them. IndexedDB rather than localStorage because a single phone video is larger than
 * the whole localStorage quota. Nothing in here is sent anywhere.
 */
const DB_NAME = 'agora-community';
const DB_VERSION = 1;
const POSTS = 'posts';
const MEDIA = 'media';

let dbPromise = null;
const memory = { posts: new Map(), media: new Map() };

function available() {
  return typeof indexedDB !== 'undefined';
}

function open() {
  if (!available()) return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(POSTS)) db.createObjectStore(POSTS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(MEDIA)) db.createObjectStore(MEDIA, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      // Private mode or a blocked database: fall back to memory for this session.
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
  }
  return dbPromise;
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const req = fn(s);
    t.oncomplete = () => resolve(req && req.result !== undefined ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function listPosts() {
  const db = await open();
  if (!db) return [...memory.posts.values()];
  return (await tx(db, POSTS, 'readonly', (s) => s.getAll())) || [];
}

export async function putPost(post) {
  const db = await open();
  if (!db) {
    memory.posts.set(post.id, post);
    return post;
  }
  await tx(db, POSTS, 'readwrite', (s) => s.put(post));
  return post;
}

export async function deletePost(id) {
  const db = await open();
  if (!db) {
    memory.posts.delete(id);
    return;
  }
  await tx(db, POSTS, 'readwrite', (s) => s.delete(id));
}

export async function putMedia(id, blob, meta = {}) {
  const db = await open();
  const record = { id, blob, type: blob.type, size: blob.size, ...meta };
  if (!db) {
    memory.media.set(id, record);
    return record;
  }
  await tx(db, MEDIA, 'readwrite', (s) => s.put(record));
  return record;
}

export async function getMedia(id) {
  const db = await open();
  if (!db) return memory.media.get(id) || null;
  return (await tx(db, MEDIA, 'readonly', (s) => s.get(id))) || null;
}

export async function deleteMedia(id) {
  const db = await open();
  if (!db) {
    memory.media.delete(id);
    return;
  }
  await tx(db, MEDIA, 'readwrite', (s) => s.delete(id));
}

/**
 * Shrink a photo before it is stored: a modern phone JPEG is 4000 pixels wide and 5 MB,
 * and neither helps a post that renders at 700 pixels. Falls back to the original file
 * for anything the canvas cannot decode.
 */
export async function downscaleImage(file, maxEdge = 1600, quality = 0.84) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 900 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob || file;
  } catch {
    return file;
  }
}
