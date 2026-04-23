/* global Summarizer, LanguageDetector, Translator */
import DOMPurify from 'dompurify';
import { marked } from 'marked';

const MAX_MODEL_CHARS = 4000;
const MIN_DETECTION_CONFIDENCE = 0.35;
/** Chrome Summarizer API 必須: en / es / ja のいずれか（拡張は日本語表示のため ja） */
const SUMMARIZER_OUTPUT_LANGUAGE = 'ja';

let pageContent = '';

const summaryElement = document.body.querySelector('#summary');
const warningElement = document.body.querySelector('#warning');
const metaElement = document.body.querySelector('#meta');
const warmupButton = document.body.querySelector('#warmup');
const summaryTypeSelect = document.querySelector('#type');
const summaryFormatSelect = document.querySelector('#format');
const summaryLengthSelect = document.querySelector('#length');

function onConfigChange() {
  const oldContent = pageContent;
  pageContent = '';
  onContentChange(oldContent);
}

[summaryTypeSelect, summaryFormatSelect, summaryLengthSelect].forEach((e) =>
  e.addEventListener('change', onConfigChange),
);
warmupButton.addEventListener('click', warmupModels);

chrome.storage.session.get('pageContent', ({ pageContent: stored }) => {
  onContentChange(stored);
});

chrome.storage.session.onChanged.addListener((changes) => {
  const pc = changes['pageContent'];
  if (pc) onContentChange(pc.newValue);
});

function isJapaneseTag(tag) {
  if (!tag || typeof tag !== 'string') return false;
  return tag.toLowerCase().split('-')[0] === 'ja';
}

function normalizeSourceLanguage(tag) {
  if (!tag) return 'en';
  const t = tag.trim();
  if (t.length === 2 || t.length === 3) return t.toLowerCase();
  const primary = t.split('-')[0].toLowerCase();
  return primary || 'en';
}

async function createSummarizer(options) {
  const availability = await Summarizer.availability(options);
  if (availability === 'unavailable') {
    throw new Error('Summarizer API が利用できません（Chrome のバージョン・環境を確認してください）。');
  }
  if (availability === 'available') {
    const summarizer = await Summarizer.create(options);
    return summarizer;
  }
  const summarizer = await Summarizer.create(options);
  summarizer.addEventListener('downloadprogress', (e) => {
    console.log(`Summarizer model ${Math.round(e.loaded * 100)}%`);
  });
  await summarizer.ready;
  return summarizer;
}

async function createLanguageDetector() {
  const availability = await LanguageDetector.availability();
  if (availability === 'unavailable') return null;
  const detector = await LanguageDetector.create({
    monitor(m) {
      m.addEventListener('downloadprogress', (e) => {
        console.log(`LanguageDetector ${Math.round(e.loaded * 100)}%`);
      });
    },
  });
  if (detector.ready) {
    await detector.ready;
  }
  return detector;
}

async function warmupModels() {
  if (warmupButton.disabled) {
    return;
  }
  if (!('Summarizer' in self)) {
    metaElement.textContent = 'Summarizer API が利用できないためウォームアップできません。';
    return;
  }
  if (!('LanguageDetector' in self) || !('Translator' in self)) {
    metaElement.textContent =
      'LanguageDetector または Translator API が利用できないためウォームアップできません。';
    return;
  }

  const defaultLabel = warmupButton.textContent;
  warmupButton.disabled = true;
  warmupButton.textContent = 'モデル準備中…';

  try {
    metaElement.textContent = 'Summarizer モデルを準備中…';
    const warmupSummarizer = await createSummarizer({
      sharedContext: 'model warmup',
      type: 'tldr',
      format: 'plain-text',
      length: 'short',
      outputLanguage: SUMMARIZER_OUTPUT_LANGUAGE,
    });
    warmupSummarizer.destroy();

    metaElement.textContent = 'LanguageDetector モデルを準備中…';
    const detector = await createLanguageDetector();
    if (detector) {
      detector.destroy?.();
    }

    metaElement.textContent = 'Translator モデルを準備中（en -> ja）…';
    const pairAvailability = await Translator.availability({
      sourceLanguage: 'en',
      targetLanguage: 'ja',
    });
    if (pairAvailability === 'unavailable') {
      throw new Error('en -> ja の翻訳ペアはこの環境で利用できません。');
    }
    const translator = await Translator.create({
      sourceLanguage: 'en',
      targetLanguage: 'ja',
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          metaElement.textContent = `Translator モデルを準備中… ${Math.round(e.loaded * 100)}%`;
        });
      },
    });
    if (translator.ready) {
      await translator.ready;
    }
    translator.destroy?.();

    metaElement.textContent = 'ウォームアップが完了しました。';
  } catch (e) {
    console.error(e);
    metaElement.textContent = `ウォームアップに失敗しました: ${e.message}`;
  } finally {
    warmupButton.disabled = false;
    warmupButton.textContent = defaultLabel;
  }
}

async function maybeTranslateToJapanese(summaryText) {
  if (!summaryText || typeof summaryText !== 'string') {
    return { text: summaryText, meta: '' };
  }
  if (!('LanguageDetector' in self) || !('Translator' in self)) {
    return {
      text: summaryText,
      meta: '言語検出または翻訳 API がこの環境で利用できません（Chrome 138 以降のデスクトップを確認してください）。',
    };
  }

  let detector;
  try {
    detector = await createLanguageDetector();
  } catch (e) {
    console.error(e);
    return { text: summaryText, meta: '言語検出モデルの準備に失敗しました。要約のみ表示します。' };
  }
  if (!detector) {
    return { text: summaryText, meta: '言語検出を利用できません。要約のみ表示します。' };
  }

  let results;
  try {
    results = await detector.detect(summaryText);
  } catch (e) {
    console.error(e);
    try {
      detector.destroy?.();
    } catch (_) {
      /* ignore */
    }
    return { text: summaryText, meta: '言語判定に失敗しました。要約のみ表示します。' };
  }
  try {
    detector.destroy?.();
  } catch (_) {
    /* ignore */
  }

  const top = results && results[0];
  if (!top || isJapaneseTag(top.detectedLanguage)) {
    return { text: summaryText, meta: '' };
  }
  if (top.confidence < MIN_DETECTION_CONFIDENCE) {
    return {
      text: summaryText,
      meta: `言語判定の信頼度が低いため翻訳をスキップしました（${top.detectedLanguage ?? 'unknown'} / ${top.confidence?.toFixed?.(2) ?? '?'}）。`,
    };
  }

  const rawTag = (top.detectedLanguage || '').trim();
  const shortTag = normalizeSourceLanguage(rawTag);
  const sourceCandidates = [];
  if (rawTag) sourceCandidates.push(rawTag);
  if (shortTag && !sourceCandidates.includes(shortTag)) sourceCandidates.push(shortTag);

  let sourceLanguage = shortTag;
  let pairAvailability = 'unavailable';
  for (const candidate of sourceCandidates) {
    try {
      const cap = await Translator.availability({
        sourceLanguage: candidate,
        targetLanguage: 'ja',
      });
      if (cap !== 'unavailable') {
        sourceLanguage = candidate;
        pairAvailability = cap;
        break;
      }
    } catch (e) {
      console.error(e);
    }
  }

  if (pairAvailability === 'unavailable') {
    return {
      text: summaryText,
      meta: `オンデバイスで「${rawTag || shortTag} → ja」の翻訳が利用できません。要約のみ表示します。`,
    };
  }

  let translator;
  try {
    translator = await Translator.create({
      sourceLanguage,
      targetLanguage: 'ja',
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          console.log(`Translator ${Math.round(e.loaded * 100)}%`);
        });
      },
    });
    if (translator.ready) {
      await translator.ready;
    }
  } catch (e) {
    console.error(e);
    return {
      text: summaryText,
      meta: `翻訳モデルの準備に失敗しました（${sourceLanguage} → 日本語）。要約のみ表示します。`,
    };
  }

  let translated;
  try {
    if (summaryText.length > 4000 && translator.translateStreaming) {
      let acc = '';
      const stream = translator.translateStreaming(summaryText);
      for await (const chunk of stream) {
        acc += chunk;
      }
      translated = acc;
    } else {
      translated = await translator.translate(summaryText);
    }
  } catch (e) {
    console.error(e);
    try {
      translator.destroy?.();
    } catch (_) {
      /* ignore */
    }
    return { text: summaryText, meta: '翻訳処理に失敗しました。要約のみ表示します。' };
  }
  try {
    translator.destroy?.();
  } catch (_) {
    /* ignore */
  }

  return {
    text: translated,
    meta: `検出言語: ${top.detectedLanguage}（信頼度 ${top.confidence.toFixed(2)}）→ 日本語に翻訳しました。`,
  };
}

async function generateSummary(text) {
  const options = {
    sharedContext: 'これは Web ページの本文です。',
    type: summaryTypeSelect.value,
    format: summaryFormatSelect.value,
    length: summaryLengthSelect.value,
    outputLanguage: SUMMARIZER_OUTPUT_LANGUAGE,
  };

  if (!('Summarizer' in self)) {
    return 'Summarizer API がこの環境で利用できません。';
  }

  const summarizer = await createSummarizer(options);
  const summary = await summarizer.summarize(text);
  summarizer.destroy();
  return summary;
}

async function onContentChange(newContent) {
  if (pageContent === newContent) {
    return;
  }
  pageContent = newContent;
  metaElement.textContent = '';

  if (newContent) {
    if (newContent.length > MAX_MODEL_CHARS) {
      updateWarning(
        `テキストが長すぎます（${newContent.length} 文字）。要約はおおよそ ${MAX_MODEL_CHARS} 文字までが目安です。`,
      );
    } else {
      updateWarning('');
    }
    await showSummaryFlow(newContent);
  } else {
    updateWarning('');
    await renderSummary("要約できる本文がありません（Reader 向けの記事として認識できないページなど）。");
  }
}

async function showSummaryFlow(content) {
  await renderSummary('要約を生成しています…');
  let summary;
  try {
    summary = await generateSummary(content);
  } catch (e) {
    console.error(e);
    await renderSummary('エラー: ' + e.message);
    return;
  }

  await renderSummary('言語判定・翻訳を処理しています…');
  const { text, meta } = await maybeTranslateToJapanese(summary);
  metaElement.textContent = meta || '';
  await renderSummary(text);
}

async function renderSummary(text) {
  const fmt = summaryFormatSelect.value;
  summaryElement.classList.toggle('summary--plain', fmt !== 'markdown');
  summaryElement.classList.toggle('summary--md', fmt === 'markdown');
  if (fmt === 'markdown') {
    summaryElement.innerHTML = DOMPurify.sanitize(
      marked.parse(text, {
        gfm: true,
        breaks: true,
      }),
    );
  } else {
    summaryElement.textContent = text;
  }
}

async function updateWarning(warning) {
  warningElement.textContent = warning;
  if (warning) {
    warningElement.removeAttribute('hidden');
  } else {
    warningElement.setAttribute('hidden', '');
  }
}
