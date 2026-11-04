/* Convert English journal title to Korean on save (body stays as typed) */
(function (global) {
  const HANGUL = /[\u3131-\u318E\uAC00-\uD7A3]/;
  const LATIN = /[a-zA-Z]/;

  function hasHangul(s) {
    return HANGUL.test(s || '');
  }

  function shouldTranslate(s) {
    const t = (s || '').trim();
    if (!t || hasHangul(t)) return false;
    return LATIN.test(t);
  }

  function translationOk(original, translated) {
    const o = (original || '').trim();
    const t = (translated || '').trim();
    if (!t) return false;
    if (hasHangul(t)) return true;
    return t.toLowerCase() !== o.toLowerCase();
  }

  async function googleTranslateEnToKo(text) {
    const q = text.trim();
    const url =
      'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dt=t&q=' +
      encodeURIComponent(q);
    const res = await fetch(url);
    if (!res.ok) throw new Error('Translate network error');
    const data = await res.json();
    if (!data || !data[0]) throw new Error('Unexpected translate response');
    return data[0]
      .map((part) => part[0])
      .join('')
      .trim();
  }

  async function myMemoryTranslateEnToKo(text) {
    const q = text.trim();
    const url =
      'https://api.mymemory.translated.net/get?q=' +
      encodeURIComponent(q) +
      '&langpair=en|ko';
    const res = await fetch(url);
    if (!res.ok) throw new Error('MyMemory network error');
    const data = await res.json();
    const status = Number(data.responseStatus);
    if (status !== 200 || !data.responseData?.translatedText) {
      throw new Error(data.responseDetails || 'MyMemory failed');
    }
    return data.responseData.translatedText.trim();
  }

  async function translateEnToKo(text) {
    const q = text.trim();
    if (!q) return text;
    let lastErr;
    try {
      const g = await googleTranslateEnToKo(q);
      if (translationOk(q, g)) return g;
    } catch (e) {
      lastErr = e;
    }
    try {
      const m = await myMemoryTranslateEnToKo(q);
      if (translationOk(q, m)) return m;
    } catch (e) {
      lastErr = e;
    }
    throw lastErr || new Error('Could not translate — try a full sentence');
  }

  async function prepareJournalTitle(title) {
    let t = title;
    let changed = false;
    let failed = false;
    if (shouldTranslate(title)) {
      try {
        const translated = await translateEnToKo(title);
        t = translated;
        changed = true;
      } catch {
        failed = true;
      }
    }
    return { title: t, changed, failed };
  }

  global.MLWKorean = {
    hasHangul,
    shouldTranslate,
    translateEnToKo,
    prepareJournalTitle,
    prepareJournalFields: prepareJournalTitle,
  };
})(typeof window !== 'undefined' ? window : globalThis);
