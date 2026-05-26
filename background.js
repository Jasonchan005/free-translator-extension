// Background service worker for FreeTranslator extension

const MYMEMORY_EMAIL = 'translate@freetranslator.com';

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'translate-selection',
    title: 'Translate with Hover Translate',
    contexts: ['selection']
  });
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'translate-selection' && info.selectionText) {
    chrome.tabs.sendMessage(tab.id, {
      action: 'showTranslation',
      text: info.selectionText
    });
  }
});

// Listen for translation requests from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translate') {
    translateText(request.text, request.source, request.target)
      .then(result => {
        // Track usage
        chrome.storage.local.get(['dailyUsage'], (data) => {
          const usage = (data.dailyUsage || 0) + request.text.length;
          chrome.storage.local.set({ dailyUsage: usage, lastUsed: Date.now() });
        });
        sendResponse({ success: true, translation: result.translation, engine: result.engine });
      })
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  }

  if (request.action === 'getUsage') {
    chrome.storage.local.get(['dailyUsage'], (data) => {
      sendResponse({ usage: data.dailyUsage || 0, limit: 50000 });
    });
    return true;
  }

  if (request.action === 'openWebsite') {
    chrome.tabs.create({ url: 'https://free-translator-liart.vercel.app/' });
  }

  // Save note
  if (request.action === 'saveNote') {
    chrome.storage.local.get(['notes'], (data) => {
      const notes = data.notes || [];
      notes.unshift(request.note);
      chrome.storage.local.set({ notes: notes.slice(0, 500) });
      sendResponse({ success: true });
    });
    return true;
  }

  // List notes
  if (request.action === 'listNotes') {
    chrome.storage.local.get(['notes'], (data) => {
      sendResponse({ notes: data.notes || [] });
    });
    return true;
  }

  // Delete note
  if (request.action === 'deleteNote') {
    chrome.storage.local.get(['notes'], (data) => {
      const notes = (data.notes || []).filter(n => n.id !== request.id);
      chrome.storage.local.set({ notes });
      sendResponse({ success: true });
    });
    return true;
  }

  // Export notes
  if (request.action === 'exportNotes') {
    chrome.storage.local.get(['notes'], (data) => {
      const notes = data.notes || [];
      let csv = 'Original,Translation,Source URL,Time\n';
      notes.forEach(n => {
        csv += `"${(n.original||'').replace(/"/g,'""')}","${(n.translated||'').replace(/"/g,'""')}","${n.url||''}","${n.time||''}"\n`;
      });
      sendResponse({ csv });
    });
    return true;
  }
});

async function translateText(text, source = 'en', target = 'zh-CN') {
  // Try MyMemory first
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${source}|${target}&de=${MYMEMORY_EMAIL}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      return { translation: data.responseData.translatedText, engine: 'MyMemory' };
    }
  } catch(e) {}

  // Fallback to LibreTranslate
  try {
    const res = await fetch('https://libretranslate.com/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, source, target, format: 'text' })
    });
    const data = await res.json();
    if (data.translatedText) {
      return { translation: data.translatedText, engine: 'LibreTranslate' };
    }
  } catch(e) {}

  throw new Error('Translation service unavailable. Try again later.');
}
