// IndexedDB helper for persisting files across mobile browser tab reloads and background kills
const DB_NAME = 'autoprint_db';
const DB_VERSION = 1;
const STORE_NAME = 'selected_files';

function openDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save array of File objects to IndexedDB.
 * CRITICAL: We read all file ArrayBuffers BEFORE creating the IDB transaction.
 * IndexedDB transactions auto-close if there are no pending requests when the
 * event loop yields. By doing async file reads first, the transaction only
 * contains synchronous IDB operations (clear + put) that execute immediately.
 */
export async function saveFilesToStorage(files) {
  try {
    if (!files || files.length === 0) {
      // If called with empty array, just clear
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
    }

    // Step 1: Read ALL file data into memory BEFORE touching IndexedDB
    const items = await Promise.all(
      files.map(async (file, idx) => {
        const arrayBuffer = await file.arrayBuffer();
        return {
          id: `file-${idx}`,
          name: file.name,
          type: file.type || 'application/octet-stream',
          lastModified: file.lastModified,
          size: file.size,
          buffer: arrayBuffer
        };
      })
    );

    // Step 2: Now open a transaction and do ALL IDB ops synchronously (no awaits)
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    // Clear and put in immediate succession — no async gaps
    store.clear();
    for (const item of items) {
      store.put(item);
    }

    return new Promise((res, rej) => {
      tx.oncomplete = res;
      tx.onerror = rej;
    });
  } catch (err) {
    console.error('Error saving files to IndexedDB:', err);
  }
}

/**
 * Retrieve saved File objects from IndexedDB
 */
export async function loadFilesFromStorage() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    const items = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    if (!items || items.length === 0) return [];

    // Reconstruct File objects from ArrayBuffers
    const files = items.map((item) => {
      return new File([item.buffer], item.name, {
        type: item.type,
        lastModified: item.lastModified
      });
    });

    return files;
  } catch (err) {
    console.error('Error loading files from IndexedDB:', err);
    return [];
  }
}

/**
 * Clear saved files from IndexedDB
 */
export async function clearFilesFromStorage() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
  } catch (err) {
    console.error('Error clearing files from IndexedDB:', err);
  }
}
