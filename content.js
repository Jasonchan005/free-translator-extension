// Content script for FreeTranslator extension

let hoverTimer = null;
let tooltipEl = null;
let lastHoveredText = '';
let currentTranslation = { source: '', target: '', original: '', translated: '' };

// Create tooltip element
function createTooltip() {
  if (tooltipEl) return;
  tooltipEl = document.createElement('div');
  tooltipEl.id = 'freetranslator-tooltip';
  tooltipEl.innerHTML = `
    <div class="ft-header">
      <span class="ft-logo">🌐</span>
      <span class="ft-title">FreeTranslator</span>
      <button class="ft-close">&times;</button>
    </div>
    <div class="ft-source"></div>
    <div class="ft-result">Hover over text to translate...</div>
    <div class="ft-footer">
      <span class="ft-engine"></span>
      <button class="ft-save-btn" title="Save to notes">💾</button>
      <a href="https://free-translator-liart.vercel.app/" target="_blank" class="ft-link">Open Website →</a>
    </div>
  `;
  document.body.appendChild(tooltipEl);

  // Close button
  tooltipEl.querySelector('.ft-close').addEventListener('click', () => {
    tooltipEl.style.display = 'none';
  });

  // Save button
  tooltipEl.querySelector('.ft-save-btn').addEventListener('click', () => {
    if (!currentTranslation.original) return;
    const note = {
      id: Date.now(),
      original: currentTranslation.original,
      translated: currentTranslation.translated,
      sourceLang: currentTranslation.source,
      targetLang: currentTranslation.target,
      url: window.location.href,
      pageTitle: document.title,
      time: new Date().toISOString()
    };
    chrome.runtime.sendMessage({ action: 'saveNote', note }, (res) => {
      if (res && res.success) {
        const btn = tooltipEl.querySelector('.ft-save-btn');
        btn.textContent = '✅';
        setTimeout(() => { btn.textContent = '💾'; }, 1500);
      }
    });
  });

  // Draggable
  let isDragging = false, startX, startY, startLeft, startTop;
  tooltipEl.querySelector('.ft-header').addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX; startY = e.clientY;
    startLeft = tooltipEl.offsetLeft; startTop = tooltipEl.offsetTop;
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', () => { isDragging = false; });
  });
  function onDrag(e) {
    if (!isDragging) return;
    tooltipEl.style.left = (startLeft + e.clientX - startX) + 'px';
    tooltipEl.style.top = (startTop + e.clientY - startY) + 'px';
  }
}

// Show tooltip near mouse
function showTooltip(text, x, y) {
  createTooltip();
  const sourceEl = tooltipEl.querySelector('.ft-source');
  const resultEl = tooltipEl.querySelector('.ft-result');
  const engineEl = tooltipEl.querySelector('.ft-engine');

  currentTranslation.original = text;
  sourceEl.textContent = `"${text.substring(0, 120)}${text.length > 120 ? '...' : ''}"`;
  resultEl.textContent = 'Translating...';
  engineEl.textContent = '';
  tooltipEl.style.display = 'block';

  // Position tooltip
  const w = 360, h = 220;
  let left = x + 10, top = y + 10;
  if (left + w > window.innerWidth) left = x - w - 10;
  if (top + h > window.innerHeight) top = y - h - 10;
  if (left < 0) left = 10;
  if (top < 0) top = 10;
  tooltipEl.style.left = left + 'px';
  tooltipEl.style.top = top + 'px';

  // Detect language direction
  const hasCJK = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(text);
  currentTranslation.source = hasCJK ? 'zh-CN' : 'en';
  currentTranslation.target = hasCJK ? 'en' : 'zh-CN';

  // Translate
  chrome.runtime.sendMessage({
    action: 'translate',
    text: text,
    source: currentTranslation.source,
    target: currentTranslation.target
  }, (response) => {
    if (response && response.success) {
      currentTranslation.translated = response.translation;
      resultEl.textContent = response.translation;
      engineEl.textContent = `via ${response.engine}`;
    } else {
      resultEl.textContent = 'Translation failed. Try selecting text and right-clicking.';
    }
  });
}

// Hover detection
document.addEventListener('mouseover', (e) => {
  const target = e.target;
  if (!target || target.closest('#freetranslator-tooltip')) return;
  let text = '';
  if (target.tagName === 'IMG' && target.alt) text = target.alt;
  else if (target.textContent) {
    text = target.textContent.trim().substring(0, 500);
    if (text.length < 3 || /^[\d\s\W]+$/.test(text)) text = '';
  }
  if (!text || text === lastHoveredText) return;
  clearTimeout(hoverTimer);
  lastHoveredText = text;
  hoverTimer = setTimeout(() => {
    showTooltip(text, e.clientX, e.clientY);
  }, 1000);
});

document.addEventListener('mouseout', (e) => {
  if (e.target.closest('#freetranslator-tooltip')) return;
  clearTimeout(hoverTimer);
});

// Listen for context menu translation
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'showTranslation') {
    showTooltip(request.text, 100, 100);
  }
});
