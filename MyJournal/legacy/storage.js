/* My Little World — persistence (localStorage + IndexedDB for photos) */
(function (global) {
  const DB_NAME = 'mlw_db';
  const DB_VERSION = 1;
  const STORE = 'photos';
  const LS_G = 'mlw_g';
  const LS_MIGRATED = 'mlw_g_idb_v1';

  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!global.indexedDB) {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
    });
    return dbPromise;
  }

  function dataUrlToBlob(dataUrl) {
    const [header, b64] = dataUrl.split(',');
    const mime = (header.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  async function putPhoto(id, blob) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put({ id, blob });
    });
  }

  async function getPhotoBlob(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result ? req.result.blob : null);
      req.onerror = () => reject(req.error);
    });
  }

  async function deletePhotoBlob(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).delete(id);
    });
  }

  async function clearPhotoStore() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).clear();
    });
  }

  function revokeGalleryUrls(items) {
    items.forEach((p) => {
      if (p._objUrl) {
        URL.revokeObjectURL(p._objUrl);
        delete p._objUrl;
      }
    });
  }

  async function blobToObjectUrl(id) {
    const blob = await getPhotoBlob(id);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    return url;
  }

  async function loadGalleryMeta() {
    const raw = localStorage.getItem(LS_G);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async function hydrateGallery(meta) {
    const out = [];
    for (const item of meta) {
      const copy = { ...item };
      if (item.src && item.src.startsWith('data:')) {
        copy.src = item.src;
      } else if (global.indexedDB) {
        const url = await blobToObjectUrl(item.id);
        if (url) {
          copy.src = url;
          copy._objUrl = url;
        } else if (item.src) {
          copy.src = item.src;
        }
      } else if (item.src) {
        copy.src = item.src;
      }
      out.push(copy);
    }
    return out;
  }

  async function migrateLegacyGallery() {
    if (localStorage.getItem(LS_MIGRATED)) return false;
    const raw = localStorage.getItem(LS_G);
    if (!raw || !global.indexedDB) return false;
    let legacy;
    try {
      legacy = JSON.parse(raw);
    } catch {
      return false;
    }
    if (!Array.isArray(legacy) || !legacy.length) {
      localStorage.setItem(LS_MIGRATED, '1');
      return false;
    }
    const hasDataUrls = legacy.some((p) => p.src && p.src.startsWith('data:'));
    if (!hasDataUrls) {
      localStorage.setItem(LS_MIGRATED, '1');
      return false;
    }
    const meta = [];
    for (const p of legacy) {
      if (p.src && p.src.startsWith('data:')) {
        const blob = dataUrlToBlob(p.src);
        await putPhoto(p.id, blob);
        meta.push({ id: p.id, date: p.date, name: p.name });
      } else {
        meta.push({ id: p.id, date: p.date, name: p.name, src: p.src });
      }
    }
    localStorage.setItem(LS_G, JSON.stringify(meta));
    localStorage.setItem(LS_MIGRATED, '1');
    return true;
  }

  async function loadGallery() {
    await migrateLegacyGallery();
    const meta = await loadGalleryMeta();
    return hydrateGallery(meta);
  }

  async function syncPhotoStore(gallery) {
    if (!global.indexedDB) return;
    const db = await openDB();
    const ids = new Set(gallery.map((p) => p.id));
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.getAllKeys();
      req.onsuccess = () => {
        (req.result || []).forEach((id) => {
          if (!ids.has(id)) store.delete(id);
        });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function persistGallery(gallery) {
    const meta = [];
    for (const p of gallery) {
      const entry = { id: p.id, date: p.date, name: p.name };
      if (p.src && p.src.startsWith('data:') && global.indexedDB) {
        const blob = dataUrlToBlob(p.src);
        await putPhoto(p.id, blob);
      } else if (p.src && !p.src.startsWith('blob:') && !p._objUrl) {
        entry.src = p.src;
      }
      meta.push(entry);
    }
    try {
      await syncPhotoStore(gallery);
      localStorage.setItem(LS_G, JSON.stringify(meta));
      return true;
    } catch (e) {
      return { error: e };
    }
  }

  async function removeGalleryPhoto(id) {
    if (global.indexedDB) await deletePhotoBlob(id);
  }

  async function clearAllPhotos() {
    if (global.indexedDB) await clearPhotoStore();
    localStorage.removeItem(LS_G);
    localStorage.removeItem(LS_MIGRATED);
  }

  async function exportGalleryBlobs(meta) {
    const photos = {};
    for (const p of meta) {
      const blob = await getPhotoBlob(p.id);
      if (blob) {
        photos[p.id] = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.onerror = rej;
          r.readAsDataURL(blob);
        });
      } else if (p.src) {
        photos[p.id] = p.src;
      }
    }
    return photos;
  }

  async function importGalleryBlobs(items, photoMap) {
    await clearPhotoStore();
    const hydrated = [];
    for (const p of items) {
      const src = photoMap[p.id];
      if (src && src.startsWith('data:') && global.indexedDB) {
        await putPhoto(p.id, dataUrlToBlob(src));
        const url = await blobToObjectUrl(p.id);
        hydrated.push({ ...p, src: url, _objUrl: url });
      } else if (src) {
        hydrated.push({ ...p, src });
      } else {
        hydrated.push({ ...p, src: '' });
      }
    }
    const meta = items.map(({ id, date, name }) => ({ id, date, name }));
    localStorage.setItem(LS_G, JSON.stringify(meta));
    localStorage.setItem(LS_MIGRATED, '1');
    return hydrated;
  }

  function estimateBytes() {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      total += (k.length + (localStorage.getItem(k) || '').length) * 2;
    }
    return total;
  }

  async function storageInfo() {
    const used = estimateBytes();
    let quota = null;
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        quota = est.quota;
      } catch { /* ignore */ }
    }
    return { used, quota };
  }

  global.MLWStorage = {
    loadGallery,
    persistGallery,
    removeGalleryPhoto,
    clearAllPhotos,
    revokeGalleryUrls,
    exportGalleryBlobs,
    importGalleryBlobs,
    storageInfo,
    dataUrlToBlob,
  };
})(typeof window !== 'undefined' ? window : globalThis);
