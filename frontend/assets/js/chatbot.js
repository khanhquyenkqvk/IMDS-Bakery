(function () {
   function resolveApiOrigin() {
    if (window.API_BASE && /^https?:\/\//i.test(window.API_BASE)) return window.API_BASE;
    if (window.API_BASE_URL && /^https?:\/\//i.test(window.API_BASE_URL)) return window.API_BASE_URL;

    const host = location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return `${location.protocol}//${host}:5000`;
    }
    return location.origin; // https://imdsbakery.id.vn
  }

  const API_ORIGIN = resolveApiOrigin();
  const AI_PROXY_ENDPOINT = `${API_ORIGIN}/api/ai/chat`;

  const STORAGE_KEY = 'employee_chatbot_history';
  const MAX_CONTEXT = 10;
  const MAX_HISTORY_ITEMS = 30;

  if (window.__EMPLOYEE_CHATBOT_INITIALIZED__) {
    return;
  }
  window.__EMPLOYEE_CHATBOT_INITIALIZED__ = true;

  document.addEventListener('DOMContentLoaded', initChatbot);

  function initChatbot() {
    const headerRight = document.querySelector('.header .header-right');
    if (!headerRight) return;

    const launcher = ensureLauncher(headerRight);
    const panelParts = ensurePanel();
    if (!launcher || !panelParts) return;

    const { panel, closeBtn, messages, form, input, sendBtn, labelEl } = panelParts;
    const historyLog = loadHistoryLog();
    const conversation = [];

    historyLog.slice(-MAX_CONTEXT).forEach(entry => {
      conversation.push({
        role: entry.role,
        parts: [{ text: entry.text }],
      });
    });

    const initialBubble = messages.querySelector('[data-chatbot-initial]');
    if (!historyLog.length && initialBubble && initialBubble.textContent.trim()) {
      conversation.push({ role: 'model', parts: [{ text: initialBubble.textContent.trim() }] });
    } else if (historyLog.length && initialBubble) {
      const wrapper = initialBubble.closest('.chatbot-message');
      if (wrapper) wrapper.remove();
    }

    const setPanelState = (shouldOpen) => {
      panel.classList.toggle('is-visible', shouldOpen);
      panel.setAttribute('aria-hidden', String(!shouldOpen));
      launcher.classList.toggle('is-active', shouldOpen);
      if (shouldOpen) {
        input.focus();
      } else {
        launcher.focus();
      }
    };

    const togglePanel = () => {
      const open = panel.classList.contains('is-visible');
      setPanelState(!open);
    };

    launcher.addEventListener('click', togglePanel);
    closeBtn.addEventListener('click', () => setPanelState(false));
    document.addEventListener('keydown', (evt) => {
      if (evt.key === 'Escape' && panel.classList.contains('is-visible')) {
        setPanelState(false);
      }
    });

    const appendMessage = (sender, text, options = {}) => {
      const { skipHistory = false, extraClass = '' } = options;
      const bubble = document.createElement('div');
      bubble.className = `chatbot-message chatbot-message--${sender}${extraClass ? ` ${extraClass}` : ''}`;
      const paragraph = document.createElement('p');
      const displayText = sender === 'bot'
        ? stripSimpleMarkdown(decodeEscapes(text))
        : text;
      paragraph.textContent = displayText;
      bubble.appendChild(paragraph);
      messages.appendChild(bubble);
      messages.scrollTop = messages.scrollHeight;

      if (!skipHistory) {
        const storedRole = sender === 'user' ? 'user' : 'model';
        conversation.push({ role: storedRole, parts: [{ text }] });
        if (conversation.length > MAX_CONTEXT) {
          conversation.splice(0, conversation.length - MAX_CONTEXT);
        }
        historyLog.push({ role: storedRole, text });
        if (historyLog.length > MAX_HISTORY_ITEMS) {
          historyLog.splice(0, historyLog.length - MAX_HISTORY_ITEMS);
        }
        persistHistory(historyLog);
      }
      return bubble;
    };

    historyLog.forEach(entry => {
      appendMessage(entry.role === 'model' ? 'bot' : 'user', entry.text, { skipHistory: true });
    });

    applyComposerLanguage(input, labelEl);
    window.addEventListener('app-language-change', (evt) => {
      applyComposerLanguage(input, labelEl, evt.detail);
    });
    window.addEventListener('storage', (evt) => {
      if (evt.key === 'app_language') {
        applyComposerLanguage(input, labelEl, evt.newValue);
      }
    });

    const showThinkingBubble = () => {
      const lang = getCurrentLang();
      const thinking = lang === 'vi'
        ? 'Dang chuan bi cau tra loi...'
        : 'Preparing a response...';
      return appendMessage('bot', thinking, { skipHistory: true, extraClass: 'chatbot-message--status' });
    };

    const setComposerBusy = (isBusy) => {
      form.classList.toggle('is-busy', isBusy);
      input.disabled = isBusy;
      sendBtn.disabled = isBusy;
    };

    const fetchAiResponse = async () => {
      const response = await fetch(AI_PROXY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation: conversation.slice() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || `AI HTTP ${response.status}`);
      }
      if (!data.reply) {
        throw new Error('AI assistant returned an empty response.');
      }
      return data.reply;
    };

    const handleSubmit = async (event) => {
      if (event) event.preventDefault();
      const value = input.value.trim();
      if (!value || form.classList.contains('is-busy')) {
        input.focus();
        return;
      }

      appendMessage('user', value);
      input.value = '';

      const thinkingBubble = showThinkingBubble();
      setComposerBusy(true);
      try {
        const reply = await fetchAiResponse();
        thinkingBubble.remove();
        appendMessage('bot', reply);
      } catch (error) {
        console.error('AI chat error:', error);
        thinkingBubble.remove();
        const lang = getCurrentLang();
        const fallback = lang === 'vi'
          ? 'Xin loi, tro ly AI dang gap su co. Vui long thu lai sau.'
          : 'Sorry, the AI assistant ran into an issue. Please try again.';
        appendMessage('bot', fallback);
      } finally {
        setComposerBusy(false);
      }
    };

    form.addEventListener('submit', handleSubmit);
  }

  function ensureLauncher(headerRight) {
    let launcher = document.getElementById('chatbotLauncher');
    if (launcher) return launcher;

    launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.id = 'chatbotLauncher';
    launcher.className = 'chatbot-launcher';
    launcher.setAttribute('aria-label', 'AI Chatbot');
    launcher.setAttribute('title', 'AI Chatbot');
    launcher.innerHTML = '<i class="fa-solid fa-robot"></i>';

    const dateBlock = headerRight.querySelector('.date-block');
    if (dateBlock) {
      headerRight.insertBefore(launcher, dateBlock);
    } else if (headerRight.firstChild) {
      headerRight.insertBefore(launcher, headerRight.firstChild);
    } else {
      headerRight.appendChild(launcher);
    }
    return launcher;
  }

  function ensurePanel() {
    let panel = document.getElementById('chatbotPanel');
    if (panel) {
      return {
        panel,
        closeBtn: panel.querySelector('#chatbotClose'),
        messages: panel.querySelector('#chatbotMessages'),
        form: panel.querySelector('#chatbotForm'),
        input: panel.querySelector('#chatbotInput'),
        sendBtn: panel.querySelector('#chatbotSubmit'),
        labelEl: panel.querySelector('[data-send-label]'),
      };
    }

    panel = document.createElement('div');
    panel.id = 'chatbotPanel';
    panel.className = 'chatbot-panel';
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = `
      <div class="chatbot-panel__header">
        <div class="chatbot-panel__title">
          <i class="fa-solid fa-robot"></i>
          <div>
            <span class="chatbot-panel__name" data-en="IMDS-BOT" data-vi="IMDS-BOT">IMDS-BOT</span>
            <small></small>
          </div>
        </div>
        <button class="chatbot-panel__close" id="chatbotClose" type="button" aria-label="Dong tro ly AI">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div class="chatbot-panel__messages" id="chatbotMessages">
        <div class="chatbot-message chatbot-message--bot">
          <p data-chatbot-initial data-en="Hello! I'm your AI assistant. Ask me anything about today's work."
             data-vi="Xin chao! Toi la tro ly AI. Hay hoi toi ve cong viec hom nay.">
             Xin chao! Toi la tro ly AI. Hay hoi toi ve cong viec hom nay.
          </p>
        </div>
      </div>
      <form class="chatbot-panel__composer" id="chatbotForm">
        <input type="text" id="chatbotInput" placeholder="Nhap cau hoi cua ban..." autocomplete="off" aria-label="Noi dung tin nhan" data-placeholder-en="Ask a question..." data-placeholder-vi="Nhập câu hỏi của bạn...">
        <button type="submit" id="chatbotSubmit">
          <span data-send-label data-en="Send" data-vi="Gửi">Gửi</span>
          <i class="fa-solid fa-paper-plane"></i>
        </button>
      </form>
    `;

    document.body.appendChild(panel);
    return {
      panel,
      closeBtn: panel.querySelector('#chatbotClose'),
      messages: panel.querySelector('#chatbotMessages'),
      form: panel.querySelector('#chatbotForm'),
      input: panel.querySelector('#chatbotInput'),
      sendBtn: panel.querySelector('#chatbotSubmit'),
      labelEl: panel.querySelector('[data-send-label]'),
    };
  }

  function loadHistoryLog() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map(entry => {
          const text = typeof entry?.text === 'string' ? entry.text.trim() : '';
          if (!text) return null;
          const role = entry.role === 'model' ? 'model' : 'user';
          return { role, text };
        })
        .filter(Boolean);
    } catch (_) {
      return [];
    }
  }

  function persistHistory(log) {
    try {
      const payload = log.map(item => ({
        role: item.role === 'model' ? 'model' : 'user',
        text: item.text,
      }));
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (_) {
      /* ignore */
    }
  }

  function applyComposerLanguage(inputEl, labelEl, overrideLang) {
    if (!inputEl) return;
    const lang = (overrideLang === 'en' || overrideLang === 'vi') ? overrideLang : getCurrentLang();
    const placeholder = lang === 'vi'
      ? inputEl.getAttribute('data-placeholder-vi')
      : inputEl.getAttribute('data-placeholder-en');
    if (placeholder) {
      inputEl.placeholder = placeholder;
      inputEl.setAttribute('aria-label', placeholder);
    }
    if (labelEl) {
      const labelText = lang === 'vi'
        ? labelEl.getAttribute('data-vi')
        : labelEl.getAttribute('data-en');
      if (labelText) {
        labelEl.textContent = labelText;
      }
    }
  }

  function getCurrentLang() {
    try {
      if (window.GlobalLanguage?.getLanguage) return window.GlobalLanguage.getLanguage();
      if (typeof window.GlobalLanguage?.current === 'string') return window.GlobalLanguage.current;
    } catch (_) {
      /* ignore */
    }
    try {
      const stored = localStorage.getItem('app_language');
      if (stored === 'en' || stored === 'vi') return stored;
    } catch (_) {}
    return 'vi';
  }

  function stripSimpleMarkdown(text) {
    if (typeof text !== 'string') return '';
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
      .replace(/\$([^$]+)\$/g, '$1')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}[-*]\s+/gm, '- ')
      .replace(/^\s{0,3}\d+\.\s+/gm, '')
      .replace(/-{3,}/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function decodeEscapes(text) {
    if (typeof text !== 'string') return '';
    let output = text
      .replace(/\\\\/g, '\n')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\[/g, '[')
      .replace(/\\\]/g, ']')
      .replace(/\\\{/g, '{')
      .replace(/\\\}/g, '}')
      .replace(/\\\|/g, '|')
      .replace(/\\\^/g, '^')
      .replace(/\\\_/g, '_')
      .replace(/\\\*/g, '*')
      .replace(/\\\+/g, '+')
      .replace(/\\\-/g, '-')
      .replace(/\\=/g, '=');

    const latexMap = [
      { regex: /\\cdot/g, value: '·' },
      { regex: /\\times/g, value: '×' },
      { regex: /\\pm/g, value: '±' },
      { regex: /\\rightarrow/g, value: '→' },
      { regex: /\\to/g, value: '→' },
      { regex: /\\implies/g, value: '⇒' },
      { regex: /\\sqrt/g, value: '√' },
      { regex: /\\leq/g, value: '≤' },
      { regex: /\\geq/g, value: '≥' },
      { regex: /\\neq/g, value: '≠' },
      { regex: /\\frac\{([^}]+)\}\{([^}]+)\}/g, value: '$1/$2' },
      { regex: /\\begin\{cases\}/g, value: '(' },
      { regex: /\\end\{cases\}/g, value: ')' },
      { regex: /\\begin\{align\*?\}/g, value: '' },
      { regex: /\\end\{align\*?\}/g, value: '' }
    ];

    latexMap.forEach(item => {
      output = output.replace(item.regex, item.value);
    });

    output = output
      .replace(/\\([a-zA-Z])/g, '$1')
      .replace(/\n{3,}/g, '\n\n');

    return output;
  }

})();



