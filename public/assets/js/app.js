(() => {
    const STORAGE_KEY_PERSIST = 'gemini_enc_key_local';
    const STORAGE_KEY_SESSION = 'gemini_enc_key_session';
    const STORAGE_MODELS_CACHE = 'gemini_models_cache_v1';
    const STORAGE_MODEL_THINKING_DEFAULTS = 'gemini_model_thinking_defaults_v1';
    const STORAGE_CUSTOM_SNIPPETS = 'gemini_custom_snippets_v1';
    const SECRET_SALT = 'GeminiCodeClient::LocalObfuscation::v1';

    const BUILTIN_SNIPPETS = {
        debug: 'این کد با خطا مواجه می‌شود. علت دقیق باگ را پیدا کن، توضیح بده و نسخه اصلاح‌شده کامل را ارائه بده:\n',
        refactor: 'کد زیر را از نظر خوانایی، عملکرد، رعایت استانداردهای مدرن و جداسازی مسئولیت‌ها بازنویسی و بهینه‌سازی کن:\n',
        security: 'این کد را از نظر آسیب‌پذیری‌های امنیتی (مانند SQL Injection، XSS، CSRF، احراز هویت و اعتبارسنجی ورودی) بررسی کن و نسخه ایمن را بنویس:\n',
        explain: 'منطق و عملکرد این کد را به صورت گام‌به‌گام و شفاف توضیح بده:\n',
        zipformat: 'تمام فایل‌های کد را به صورت کامل بنویس و در خط اول هر بلوک کد حتماً مسیر دقیق فایل را با فرمت `// file: path/to/filename.ext` مشخص کن تا بتوانم آن‌ها را یکجا به صورت ZIP دانلود کنم.\n'
    };

    let state = {
        apiKey: '',
        models: [],
        modelThinkingDefaults: {},
        customSnippets: [],
        projects: [],
        chats: [],
        activeProjectId: null,
        activeChatId: null,
        attachedFiles: [],
        draftProjectFiles: [],
        editingProjectFileId: null,
        isStreaming: false,
        abortController: null,
        lastActualPromptTokens: null
    };

    const dom = {
        sidebar: document.getElementById('sidebar'),
        toggleSidebarBtn: document.getElementById('toggleSidebarBtn'),
        sidebarContent: document.getElementById('sidebarContent'),
        newProjectBtn: document.getElementById('newProjectBtn'),
        newChatBtn: document.getElementById('newChatBtn'),
        activeContextBadge: document.getElementById('activeContextBadge'),
        tokenBadge: document.getElementById('tokenBadge'),
        tokenCountText: document.getElementById('tokenCountText'),
        contextWarningBanner: document.getElementById('contextWarningBanner'),
        contextWarningText: document.getElementById('contextWarningText'),
        togglePinnedDrawerBtn: document.getElementById('togglePinnedDrawerBtn'),
        pinnedCountBadge: document.getElementById('pinnedCountBadge'),
        pinnedMessagesPanel: document.getElementById('pinnedMessagesPanel'),
        pinnedMessagesList: document.getElementById('pinnedMessagesList'),
        closePinnedPanelBtn: document.getElementById('closePinnedPanelBtn'),
        modelSelect: document.getElementById('modelSelect'),
        refreshModelsBtn: document.getElementById('refreshModelsBtn'),
        thinkingLevelSelect: document.getElementById('thinkingLevelSelect'),
        saveModelThinkingBtn: document.getElementById('saveModelThinkingBtn'),
        tempRange: document.getElementById('tempRange'),
        tempValue: document.getElementById('tempValue'),
        chatMessages: document.getElementById('chatMessages'),
        attachedFilesBar: document.getElementById('attachedFilesBar'),
        chatTextFileInput: document.getElementById('chatTextFileInput'),
        promptSnippetsBar: document.getElementById('promptSnippetsBar'),
        manageSnippetsBtn: document.getElementById('manageSnippetsBtn'),
        chatForm: document.getElementById('chatForm'),
        promptInput: document.getElementById('promptInput'),
        sendBtn: document.getElementById('sendBtn'),
        stopBtn: document.getElementById('stopBtn'),
        apiKeyInput: document.getElementById('apiKeyInput'),
        rememberKeyCheck: document.getElementById('rememberKeyCheck'),
        saveApiKeyBtn: document.getElementById('saveApiKeyBtn'),
        clearApiKeyBtn: document.getElementById('clearApiKeyBtn'),
        projectModalTitle: document.getElementById('projectModalTitle'),
        projectIdInput: document.getElementById('projectIdInput'),
        projectNameInput: document.getElementById('projectNameInput'),
        projectDefaultModelSelect: document.getElementById('projectDefaultModelSelect'),
        projectDefaultThinkingSelect: document.getElementById('projectDefaultThinkingSelect'),
        projectDefaultTempInput: document.getElementById('projectDefaultTempInput'),
        projectInstructionsInput: document.getElementById('projectInstructionsInput'),
        projectFilesInput: document.getElementById('projectFilesInput'),
        createEmptyProjectFileBtn: document.getElementById('createEmptyProjectFileBtn'),
        projectFilesList: document.getElementById('projectFilesList'),
        projectFileEditorPane: document.getElementById('projectFileEditorPane'),
        projectFileEditorPlaceholder: document.getElementById('projectFileEditorPlaceholder'),
        editingProjectFileName: document.getElementById('editingProjectFileName'),
        editingProjectFileContent: document.getElementById('editingProjectFileContent'),
        applyProjectFileEditBtn: document.getElementById('applyProjectFileEditBtn'),
        saveProjectBtn: document.getElementById('saveProjectBtn'),
        exportDataBtn: document.getElementById('exportDataBtn'),
        importDataInput: document.getElementById('importDataInput'),
        newSnippetTitle: document.getElementById('newSnippetTitle'),
        newSnippetPrompt: document.getElementById('newSnippetPrompt'),
        saveCustomSnippetBtn: document.getElementById('saveCustomSnippetBtn')
    };

    const apiKeyModal = new bootstrap.Modal(document.getElementById('apiKeyModal'));
    const projectModal = new bootstrap.Modal(document.getElementById('projectModal'));
    const customSnippetModal = new bootstrap.Modal(document.getElementById('customSnippetModal'));

    // --- رمزنگاری محلی کلید API ---
    function obfuscateKey(plain) {
        const bytes = new TextEncoder().encode(plain);
        const mask = new TextEncoder().encode(SECRET_SALT);
        const out = bytes.map((b, i) => b ^ mask[i % mask.length]);
        return btoa(String.fromCharCode(...out));
    }

    function deobfuscateKey(cipher) {
        try {
            const raw = atob(cipher);
            const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
            const mask = new TextEncoder().encode(SECRET_SALT);
            const out = bytes.map((b, i) => b ^ mask[i % mask.length]);
            return new TextDecoder().decode(out);
        } catch {
            return '';
        }
    }

    function loadSavedApiKey() {
        const localCipher = localStorage.getItem(STORAGE_KEY_PERSIST);
        const sessionCipher = sessionStorage.getItem(STORAGE_KEY_SESSION);
        if (localCipher) {
            state.apiKey = deobfuscateKey(localCipher);
            dom.rememberKeyCheck.checked = true;
        } else if (sessionCipher) {
            state.apiKey = deobfuscateKey(sessionCipher);
            dom.rememberKeyCheck.checked = false;
        }
        dom.apiKeyInput.value = state.apiKey;
    }

    function saveApiKey(key, persist) {
        state.apiKey = key.trim();
        localStorage.removeItem(STORAGE_KEY_PERSIST);
        sessionStorage.removeItem(STORAGE_KEY_SESSION);
        if (!state.apiKey) return;

        const cipher = obfuscateKey(state.apiKey);
        if (persist) {
            localStorage.setItem(STORAGE_KEY_PERSIST, cipher);
        } else {
            sessionStorage.setItem(STORAGE_KEY_SESSION, cipher);
        }
    }

    // --- بارگذاری تنظیمات ذخیره‌شده سطوح تفکر و قالب‌های پرامپت ---
    function loadPreferences() {
        try {
            state.modelThinkingDefaults = JSON.parse(localStorage.getItem(STORAGE_MODEL_THINKING_DEFAULTS) || '{}');
        } catch {
            state.modelThinkingDefaults = {};
        }
        try {
            state.customSnippets = JSON.parse(localStorage.getItem(STORAGE_CUSTOM_SNIPPETS) || '[]');
        } catch {
            state.customSnippets = [];
        }
        renderCustomSnippets();
    }

    function saveModelThinkingDefaults() {
        localStorage.setItem(STORAGE_MODEL_THINKING_DEFAULTS, JSON.stringify(state.modelThinkingDefaults));
    }

    function renderCustomSnippets() {
        dom.promptSnippetsBar.querySelectorAll('.custom-snippet-btn').forEach(el => el.remove());
        state.customSnippets.forEach((snip, index) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-sm btn-outline-primary py-0 px-2 text-nowrap custom-snippet-btn';
            btn.textContent = snip.title;
            btn.title = 'کلیک برای درج در پیام (راست‌کلیک برای حذف)';
            btn.addEventListener('click', () => insertSnippetIntoPrompt(snip.prompt));
            btn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (confirm(`قالب "${snip.title}" حذف شود؟`)) {
                    state.customSnippets.splice(index, 1);
                    localStorage.setItem(STORAGE_CUSTOM_SNIPPETS, JSON.stringify(state.customSnippets));
                    renderCustomSnippets();
                }
            });
            dom.promptSnippetsBar.insertBefore(btn, dom.manageSnippetsBtn);
        });
    }

    function insertSnippetIntoPrompt(text) {
        const current = dom.promptInput.value;
        dom.promptInput.value = current ? `${text}\n${current}` : text;
        dom.promptInput.focus();
        updateTokenEstimate();
    }

    // --- خواندن فایل متنی ---
    function readTextFile(file) {
        return new Promise((resolve, reject) => {
            if (file.size > 3 * 1024 * 1024) {
                reject(new Error(`حجم فایل "${file.name}" بیشتر از ۳ مگابایت است.`));
                return;
            }
            const reader = new FileReader();
            reader.onload = () => resolve({
                id: crypto.randomUUID(),
                name: file.name,
                size: file.size,
                content: String(reader.result || '')
            });
            reader.onerror = () => reject(new Error(`خطا در خواندن فایل "${file.name}".`));
            reader.readAsText(file, 'UTF-8');
        });
    }

    // --- دریافت لیست مدل‌ها از سرور ---
    async function fetchModelsFromServer(forceRefresh = false) {
        if (!forceRefresh) {
            const cached = localStorage.getItem(STORAGE_MODELS_CACHE);
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    if (Array.isArray(parsed.models) && parsed.models.length > 0) {
                        state.models = parsed.models;
                        populateModelSelects(parsed.models);
                        return;
                    }
                } catch {}
            }
        }

        if (!state.apiKey) return;

        dom.refreshModelsBtn.disabled = true;
        try {
            const res = await fetch('/api/models.php', {
                headers: { 'X-Gemini-Api-Key': state.apiKey }
            });
            const data = await res.json();
            if (!res.ok || data.error) {
                throw new Error(data.error || 'خطا در دریافت مدل‌ها');
            }
            state.models = data.models || [];
            localStorage.setItem(STORAGE_MODELS_CACHE, JSON.stringify({
                updatedAt: Date.now(),
                models: state.models
            }));
            populateModelSelects(state.models);
        } catch (err) {
            alert(err.message);
        } finally {
            dom.refreshModelsBtn.disabled = false;
        }
    }

    function populateModelSelects(models) {
        const previousMain = dom.modelSelect.value;
        const previousProj = dom.projectDefaultModelSelect.value;

        dom.modelSelect.innerHTML = '';
        dom.projectDefaultModelSelect.innerHTML = '<option value="">استفاده از مدل فعال فعلی</option>';

        if (!models.length) {
            dom.modelSelect.innerHTML = '<option value="">مدلی یافت نشد</option>';
            return;
        }

        for (const m of models) {
            const label = m.displayName ? `${m.displayName} (${m.id})` : m.id;

            const opt1 = document.createElement('option');
            opt1.value = m.id;
            opt1.textContent = label;
            dom.modelSelect.appendChild(opt1);

            const opt2 = document.createElement('option');
            opt2.value = m.id;
            opt2.textContent = label;
            dom.projectDefaultModelSelect.appendChild(opt2);
        }

        if (previousMain && models.some(m => m.id === previousMain)) {
            dom.modelSelect.value = previousMain;
        } else {
            const preferred = models.find(m => m.id.includes('2.5-pro')) || models.find(m => m.id.includes('2.5-flash')) || models[0];
            if (preferred) dom.modelSelect.value = preferred.id;
        }

        if (previousProj && models.some(m => m.id === previousProj)) {
            dom.projectDefaultModelSelect.value = previousProj;
        }

        syncThinkingAndModelUI();
        updateTokenEstimate();
    }

    // --- استخراج نام فایل از بلوک کد و دانلود ZIP ---
    function detectCodeFilename(codeText, langName, fallbackIndex) {
        const lines = codeText.split('\n');
        const firstLine = (lines[0] || '').trim();
        const fileMatch = firstLine.match(/^(?:\/\/|#|\/\*|<!--)\s*(?:file|filename|path)\s*:\s*([^\s*]+(?:\/[^\s*]+)*)/i);
        if (fileMatch && fileMatch[1]) {
            return fileMatch[1].replace(/(-->|\*\/)$/, '').trim();
        }
        const extMap = {
            php: 'php', javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts',
            css: 'css', html: 'html', json: 'json', python: 'py', py: 'py',
            sql: 'sql', bash: 'sh', shell: 'sh', yaml: 'yml', yml: 'yml', markdown: 'md', md: 'md'
        };
        const ext = extMap[(langName || '').toLowerCase()] || 'txt';
        return `snippet-${fallbackIndex}.${ext}`;
    }

    async function downloadFilesAsZip(filesList, zipName = 'gemini-code-bundle.zip') {
        if (!window.JSZip) {
            alert('کتابخانه JSZip بارگذاری نشده است.');
            return;
        }
        const zip = new JSZip();
        const usedNames = new Set();

        filesList.forEach((item, idx) => {
            let name = (item.filename || `file-${idx + 1}.txt`).replace(/^\/+/, '');
            if (usedNames.has(name)) {
                const dot = name.lastIndexOf('.');
                name = dot > 0 ? `${name.slice(0, dot)}-${idx + 1}${name.slice(dot)}` : `${name}-${idx + 1}`;
            }
            usedNames.add(name);
            zip.file(name, item.content);
        });

        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = zipName;
        a.click();
        URL.revokeObjectURL(url);
    }

    // --- رندر Markdown با بلوک کد LTR، دکمه کپی و دانلود ZIP ---
    function renderMarkdownWithTools(mdText) {
        const rawHtml = marked.parse(mdText || '');
        const container = document.createElement('div');
        container.innerHTML = rawHtml;

        const extractedFiles = [];

        container.querySelectorAll('pre').forEach((pre, index) => {
            const codeEl = pre.querySelector('code');
            const langClass = codeEl ? [...codeEl.classList].find(c => c.startsWith('language-')) : '';
            const langName = langClass ? langClass.replace('language-', '') : 'code';

            if (codeEl && window.hljs) {
                window.hljs.highlightElement(codeEl);
            }

            const rawCode = codeEl ? codeEl.innerText : pre.innerText;
            const detectedFilename = detectCodeFilename(rawCode, langName, index + 1);
            extractedFiles.push({ filename: detectedFilename, content: rawCode });

            const wrapper = document.createElement('div');
            wrapper.className = 'code-block-wrapper';

            const header = document.createElement('div');
            header.className = 'code-block-header';

            const leftInfo = document.createElement('span');
            leftInfo.textContent = `${langName} • ${detectedFilename}`;

            const btnGroup = document.createElement('div');
            btnGroup.className = 'd-flex gap-1';

            const zipSingleBtn = document.createElement('button');
            zipSingleBtn.type = 'button';
            zipSingleBtn.className = 'btn btn-sm btn-dark py-0 px-2 border border-secondary';
            zipSingleBtn.title = 'دانلود این فایل در قالب ZIP';
            zipSingleBtn.innerHTML = '<i class="bi bi-file-earmark-zip"></i> ZIP';
            zipSingleBtn.dataset.zipSingle = JSON.stringify({ filename: detectedFilename, content: rawCode });

            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'btn btn-sm btn-dark py-0 px-2 border border-secondary';
            copyBtn.innerHTML = '<i class="bi bi-clipboard"></i> کپی';
            copyBtn.dataset.copyCode = rawCode;

            btnGroup.appendChild(zipSingleBtn);
            btnGroup.appendChild(copyBtn);
            header.appendChild(leftInfo);
            header.appendChild(btnGroup);

            pre.parentNode.insertBefore(wrapper, pre);
            wrapper.appendChild(header);
            wrapper.appendChild(pre);
        });

        return { html: container.innerHTML, extractedFiles };
    }

    function bindCodeBlockButtons(rootEl) {
        rootEl.querySelectorAll('[data-copy-code]').forEach(btn => {
            btn.onclick = async () => {
                await navigator.clipboard.writeText(btn.dataset.copyCode || '');
                btn.innerHTML = '<i class="bi bi-check2 text-success"></i> کپی شد';
                setTimeout(() => {
                    btn.innerHTML = '<i class="bi bi-clipboard"></i> کپی';
                }, 1500);
            };
        });

        rootEl.querySelectorAll('[data-zip-single]').forEach(btn => {
            btn.onclick = async () => {
                const item = JSON.parse(btn.dataset.zipSingle);
                const baseZip = item.filename.split('/').pop().replace(/\.[^.]+$/, '') || 'code';
                await downloadFilesAsZip([item], `${baseZip}.zip`);
            };
        });
    }

    // --- دسترسی به پروژه و چت فعال ---
    function getActiveProject() {
        return state.projects.find(p => p.id === state.activeProjectId) || null;
    }

    function getActiveChat() {
        return state.chats.find(c => c.id === state.activeChatId) || null;
    }

    // --- همگام‌سازی پروفایل تنظیمات پروژه، سطح تفکر چت و پیش‌فرض مدل ---
    function applyProjectProfileToUI(project) {
        if (!project) return;
        if (project.defaultModel && state.models.some(m => m.id === project.defaultModel)) {
            dom.modelSelect.value = project.defaultModel;
        }
        if (project.defaultTemp !== undefined && project.defaultTemp !== '' && !Number.isNaN(Number(project.defaultTemp))) {
            dom.tempRange.value = String(project.defaultTemp);
            dom.tempValue.textContent = String(project.defaultTemp);
        }
        if (project.defaultThinking !== undefined) {
            dom.thinkingLevelSelect.value = project.defaultThinking;
        }
    }

    function syncThinkingAndModelUI() {
        const chat = getActiveChat();
        const project = getActiveProject();

        if (chat && chat.thinkingLevel !== undefined) {
            dom.thinkingLevelSelect.value = chat.thinkingLevel;
            return;
        }
        if (project && project.defaultThinking) {
            dom.thinkingLevelSelect.value = project.defaultThinking;
            return;
        }
        const currentModel = dom.modelSelect.value;
        dom.thinkingLevelSelect.value = state.modelThinkingDefaults[currentModel] || '';
    }

    // --- تخمین توکن و هشدار پر شدن کانتکست ---
    function estimateTokensFromText(text) {
        if (!text) return 0;
        // تخمین محافظه‌کارانه برای ترکیب کد انگلیسی و متن فارسی (~۳.۲ کاراکتر به ازای هر توکن)
        return Math.ceil(text.length / 3.2);
    }

    function updateTokenEstimate() {
        const project = getActiveProject();
        const chat = getActiveChat();

        let totalChars = 0;
        if (project) {
            totalChars += (project.instructions || '').length;
            for (const f of project.files || []) {
                totalChars += (f.name || '').length + (f.content || '').length + 30;
            }
        }
        if (chat && Array.isArray(chat.messages)) {
            for (const m of chat.messages) {
                totalChars += (m.text || '').length;
                for (const f of m.files || []) {
                    totalChars += (f.name || '').length + (f.content || '').length + 30;
                }
            }
        }
        totalChars += (dom.promptInput.value || '').length;
        for (const f of state.attachedFiles) {
            totalChars += (f.name || '').length + (f.content || '').length + 30;
        }

        const estimated = Math.ceil(totalChars / 3.2);
        const currentModelObj = state.models.find(m => m.id === dom.modelSelect.value);
        const limit = currentModelObj?.inputTokenLimit || 1048576;
        const ratio = limit > 0 ? (estimated / limit) : 0;

        dom.tokenCountText.textContent = `~${estimated.toLocaleString('en-US')}`;

        if (ratio >= 0.85) {
            dom.tokenBadge.className = 'badge text-bg-danger';
            dom.contextWarningBanner.classList.remove('d-none');
            dom.contextWarningBanner.className = 'alert alert-danger rounded-0 m-0 py-1 px-3 small d-flex justify-content-between align-items-center';
            dom.contextWarningText.textContent = `هشدار بحرانی کانتکست: حدود ${Math.round(ratio * 100)}% از ظرفیت ورودی مدل (${limit.toLocaleString('en-US')} توکن) پر شده است. پیشنهاد می‌شود گفتگوی جدید باز کنید یا فایل‌های اضافی را حذف نمایید.`;
        } else if (ratio >= 0.65) {
            dom.tokenBadge.className = 'badge text-bg-warning text-dark';
            dom.contextWarningBanner.classList.remove('d-none');
            dom.contextWarningBanner.className = 'alert alert-warning rounded-0 m-0 py-1 px-3 small d-flex justify-content-between align-items-center';
            dom.contextWarningText.textContent = `توجه: بیش از ${Math.round(ratio * 100)}% از ظرفیت کانتکست پر شده است (~${estimated.toLocaleString('en-US')} از ${limit.toLocaleString('en-US')} توکن).`;
        } else {
            dom.tokenBadge.className = 'badge text-bg-light border text-dark';
            dom.contextWarningBanner.classList.add('d-none');
        }
    }

    function updateContextBadge() {
        const proj = getActiveProject();
        if (proj) {
            dom.activeContextBadge.className = 'badge text-bg-info text-dark';
            dom.activeContextBadge.textContent = `پروژه: ${proj.name} (${(proj.files || []).length} فایل مرجع)`;
        } else {
            dom.activeContextBadge.className = 'badge text-bg-secondary';
            dom.activeContextBadge.textContent = 'بدون پروژه (چت عمومی)';
        }
    }

    // --- سایدبار ---
    function renderSidebar() {
        dom.sidebarContent.innerHTML = '';

        const generalChats = state.chats.filter(c => !c.projectId);
        renderChatGroup('گفتگوهای عمومی', null, generalChats);

        for (const proj of state.projects) {
            const pChats = state.chats.filter(c => c.projectId === proj.id);
            renderChatGroup(proj.name, proj.id, pChats, proj);
        }
    }

    function renderChatGroup(title, projectId, chats, projectObj = null) {
        const box = document.createElement('div');
        box.className = 'mb-3';

        const header = document.createElement('div');
        header.className = 'd-flex justify-content-between align-items-center px-2 py-1 small text-secondary fw-bold';

        const titleSpan = document.createElement('span');
        titleSpan.style.cursor = 'pointer';
        titleSpan.textContent = title;
        titleSpan.onclick = () => {
            state.activeProjectId = projectId;
            state.activeChatId = chats[0]?.id || null;
            if (projectObj) applyProjectProfileToUI(projectObj);
            syncThinkingAndModelUI();
            renderSidebar();
            renderMessages();
            updateContextBadge();
            updateTokenEstimate();
        };
        header.appendChild(titleSpan);

        if (projectObj) {
            const actions = document.createElement('div');
            actions.className = 'd-flex gap-1';

            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'btn btn-link btn-sm text-info p-0';
            editBtn.title = 'ویرایش پروژه، تنظیمات و فایل‌ها';
            editBtn.innerHTML = '<i class="bi bi-pencil-square"></i>';
            editBtn.onclick = (e) => {
                e.stopPropagation();
                openProjectModal(projectObj);
            };

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'btn btn-link btn-sm text-danger p-0';
            delBtn.title = 'حذف پروژه';
            delBtn.innerHTML = '<i class="bi bi-trash"></i>';
            delBtn.onclick = async (e) => {
                e.stopPropagation();
                if (!confirm(`پروژه "${projectObj.name}" و چت‌های آن حذف شوند؟`)) return;
                const relatedChats = state.chats.filter(c => c.projectId === projectObj.id);
                for (const rc of relatedChats) {
                    await dbHelper.delete('chats', rc.id);
                }
                await dbHelper.delete('projects', projectObj.id);
                state.projects = state.projects.filter(p => p.id !== projectObj.id);
                state.chats = state.chats.filter(c => c.projectId !== projectObj.id);
                if (state.activeProjectId === projectObj.id) {
                    state.activeProjectId = null;
                    state.activeChatId = state.chats[0]?.id || null;
                }
                renderSidebar();
                renderMessages();
                updateContextBadge();
                updateTokenEstimate();
            };

            actions.appendChild(editBtn);
            actions.appendChild(delBtn);
            header.appendChild(actions);
        }

        box.appendChild(header);

        for (const chat of chats) {
            const item = document.createElement('div');
            item.className = `sidebar-item d-flex justify-content-between align-items-center px-2 py-1 rounded mb-1 small ${chat.id === state.activeChatId ? 'active' : ''}`;
            item.style.cursor = 'pointer';

            const label = document.createElement('span');
            label.className = 'text-truncate';
            label.textContent = chat.title || 'گفتگوی بدون عنوان';

            const delChatBtn = document.createElement('button');
            delChatBtn.type = 'button';
            delChatBtn.className = 'btn btn-link btn-sm text-secondary p-0 ms-1';
            delChatBtn.innerHTML = '<i class="bi bi-x"></i>';
            delChatBtn.onclick = async (e) => {
                e.stopPropagation();
                await dbHelper.delete('chats', chat.id);
                state.chats = state.chats.filter(c => c.id !== chat.id);
                if (state.activeChatId === chat.id) {
                    state.activeChatId = state.chats[0]?.id || null;
                }
                renderSidebar();
                renderMessages();
                updateTokenEstimate();
            };

            item.onclick = () => {
                state.activeProjectId = projectId;
                state.activeChatId = chat.id;
                if (projectObj) applyProjectProfileToUI(projectObj);
                syncThinkingAndModelUI();
                renderSidebar();
                renderMessages();
                updateContextBadge();
                updateTokenEstimate();
                dom.sidebar.classList.remove('show');
            };

            item.appendChild(label);
            item.appendChild(delChatBtn);
            box.appendChild(item);
        }

        dom.sidebarContent.appendChild(box);
    }

    // --- پیام‌ها و قابلیت پین کردن ---
    function renderMessages() {
        dom.chatMessages.innerHTML = '';
        const chat = getActiveChat();

        if (!chat || !chat.messages || chat.messages.length === 0) {
            dom.chatMessages.innerHTML = `
                <div class="text-center text-muted mt-5">
                    <i class="bi bi-terminal fs-1 d-block mb-2"></i>
                    <p>پیام خود را بنویسید، از قالب‌های کدنویسی استفاده کنید یا فایل متنی اضافه نمایید.</p>
                </div>`;
            updatePinnedUI();
            return;
        }

        chat.messages.forEach((msg, idx) => {
            if (!msg.id) msg.id = crypto.randomUUID();
            appendMessageElement(msg, idx);
        });
        dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
        updatePinnedUI();
    }

    function appendMessageElement(msg, index) {
        const role = msg.role;
        const row = document.createElement('div');
        row.className = 'd-flex mb-3 justify-content-start';
        row.id = `msg-row-${msg.id}`;

        const card = document.createElement('div');
        card.className = `message-card w-100 p-3 ${role === 'user' ? 'message-user' : 'message-assistant'} ${msg.pinned ? 'message-pinned' : ''}`;

        const topBar = document.createElement('div');
        topBar.className = 'd-flex justify-content-between align-items-center mb-2';

        const roleBadge = document.createElement('span');
        roleBadge.className = 'small fw-bold text-secondary';
        roleBadge.textContent = role === 'user' ? 'شما' : 'Gemini';

        const actionsBar = document.createElement('div');
        actionsBar.className = 'd-flex align-items-center gap-1';

        const pinBtn = document.createElement('button');
        pinBtn.type = 'button';
        pinBtn.className = `btn btn-sm py-0 px-2 ${msg.pinned ? 'btn-warning text-dark' : 'btn-outline-secondary'}`;
        pinBtn.title = msg.pinned ? 'برداشتن پین پیام' : 'پین کردن پیام مهم';
        pinBtn.innerHTML = `<i class="bi ${msg.pinned ? 'bi-pin-angle-fill' : 'bi-pin-angle'}"></i>`;
        pinBtn.onclick = async () => {
            const chat = getActiveChat();
            if (!chat) return;
            msg.pinned = !msg.pinned;
            await dbHelper.put('chats', chat);
            renderMessages();
        };
        actionsBar.appendChild(pinBtn);

        topBar.appendChild(roleBadge);
        topBar.appendChild(actionsBar);
        card.appendChild(topBar);

        if (msg.files && msg.files.length > 0) {
            const filesBox = document.createElement('div');
            filesBox.className = 'mb-2 d-flex flex-wrap gap-1';
            for (const f of msg.files) {
                const chip = document.createElement('span');
                chip.className = 'badge text-bg-dark';
                chip.innerHTML = `<i class="bi bi-file-text me-1"></i>${escapeHtml(f.name)}`;
                filesBox.appendChild(chip);
            }
            card.appendChild(filesBox);
        }

        const bodyDiv = document.createElement('div');
        bodyDiv.className = 'msg-body';

        if (role === 'user') {
            const p = document.createElement('p');
            p.className = 'm-0';
            p.style.whiteSpace = 'pre-wrap';
            p.textContent = msg.text;
            bodyDiv.appendChild(p);
        } else {
            const rendered = renderMarkdownWithTools(msg.text);
            bodyDiv.innerHTML = rendered.html;
            bindCodeBlockButtons(bodyDiv);

            if (rendered.extractedFiles.length > 0) {
                const zipAllBtn = document.createElement('button');
                zipAllBtn.type = 'button';
                zipAllBtn.className = 'btn btn-sm btn-outline-primary py-0 px-2';
                zipAllBtn.innerHTML = `<i class="bi bi-file-zip-fill me-1"></i>دانلود کل کدها (${rendered.extractedFiles.length} فایل ZIP)`;
                zipAllBtn.onclick = () => downloadFilesAsZip(rendered.extractedFiles, `gemini-response-${index + 1}.zip`);
                actionsBar.insertBefore(zipAllBtn, pinBtn);
            }
        }

        card.appendChild(bodyDiv);
        row.appendChild(card);
        dom.chatMessages.appendChild(row);
        return { bodyDiv, actionsBar, pinBtn };
    }

    function updatePinnedUI() {
        const chat = getActiveChat();
        const pinnedMsgs = (chat?.messages || []).filter(m => m.pinned);

        if (pinnedMsgs.length === 0) {
            dom.togglePinnedDrawerBtn.classList.add('d-none');
            dom.pinnedMessagesPanel.classList.add('d-none');
            return;
        }

        dom.togglePinnedDrawerBtn.classList.remove('d-none');
        dom.pinnedCountBadge.textContent = String(pinnedMsgs.length);
        dom.pinnedMessagesList.innerHTML = '';

        for (const pm of pinnedMsgs) {
            const item = document.createElement('div');
            item.className = 'bg-white border rounded px-2 py-1 d-flex justify-content-between align-items-center';
            item.style.cursor = 'pointer';

            const preview = document.createElement('span');
            preview.className = 'text-truncate';
            const who = pm.role === 'user' ? 'شما' : 'Gemini';
            preview.innerHTML = `<strong>${who}:</strong> ${escapeHtml((pm.text || '').slice(0, 110))}`;

            item.onclick = () => {
                const target = document.getElementById(`msg-row-${pm.id}`);
                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            };

            item.appendChild(preview);
            dom.pinnedMessagesList.appendChild(item);
        }
    }

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, (m) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[m]));
    }

    function renderAttachedFilesBar() {
        if (!state.attachedFiles.length) {
            dom.attachedFilesBar.classList.add('d-none');
            dom.attachedFilesBar.innerHTML = '';
            updateTokenEstimate();
            return;
        }
        dom.attachedFilesBar.classList.remove('d-none');
        dom.attachedFilesBar.innerHTML = '';

        for (const f of state.attachedFiles) {
            const pill = document.createElement('span');
            pill.className = 'badge text-bg-primary d-inline-flex align-items-center gap-1 py-2 px-2';
            pill.innerHTML = `<i class="bi bi-file-earmark-code"></i> ${escapeHtml(f.name)}`;

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'btn-close btn-close-white';
            removeBtn.style.fontSize = '0.6rem';
            removeBtn.onclick = () => {
                state.attachedFiles = state.attachedFiles.filter(x => x.id !== f.id);
                renderAttachedFilesBar();
            };

            pill.appendChild(removeBtn);
            dom.attachedFilesBar.appendChild(pill);
        }
        updateTokenEstimate();
    }

    // --- مودال پروژه و ویرایش محتوای فایل‌های پروژه ---
    function openProjectModal(project = null) {
        state.editingProjectFileId = null;
        dom.projectFileEditorPane.classList.add('d-none');
        dom.projectFileEditorPane.classList.remove('d-flex');
        dom.projectFileEditorPlaceholder.classList.remove('d-none');

        if (project) {
            dom.projectModalTitle.textContent = 'ویرایش پروژه و تنظیمات';
            dom.projectIdInput.value = project.id;
            dom.projectNameInput.value = project.name;
            dom.projectDefaultModelSelect.value = project.defaultModel || '';
            dom.projectDefaultThinkingSelect.value = project.defaultThinking || '';
            dom.projectDefaultTempInput.value = project.defaultTemp ?? '';
            dom.projectInstructionsInput.value = project.instructions || '';
            state.draftProjectFiles = structuredClone(project.files || []);
        } else {
            dom.projectModalTitle.textContent = 'پروژه جدید';
            dom.projectIdInput.value = '';
            dom.projectNameInput.value = '';
            dom.projectDefaultModelSelect.value = '';
            dom.projectDefaultThinkingSelect.value = '';
            dom.projectDefaultTempInput.value = '';
            dom.projectInstructionsInput.value = '';
            state.draftProjectFiles = [];
        }
        renderDraftProjectFiles();
        projectModal.show();
    }

    function openProjectFileInEditor(fileObj) {
        state.editingProjectFileId = fileObj.id;
        dom.editingProjectFileName.value = fileObj.name;
        dom.editingProjectFileContent.value = fileObj.content;
        dom.projectFileEditorPlaceholder.classList.add('d-none');
        dom.projectFileEditorPane.classList.remove('d-none');
        dom.projectFileEditorPane.classList.add('d-flex');
        renderDraftProjectFiles();
    }

    function commitCurrentFileEditorChanges() {
        if (!state.editingProjectFileId) return;
        const target = state.draftProjectFiles.find(f => f.id === state.editingProjectFileId);
        if (!target) return;
        const newName = dom.editingProjectFileName.value.trim();
        if (newName) target.name = newName;
        target.content = dom.editingProjectFileContent.value;
        target.size = new Blob([target.content]).size;
        renderDraftProjectFiles();
    }

    function renderDraftProjectFiles() {
        if (!state.draftProjectFiles.length) {
            dom.projectFilesList.innerHTML = '<div class="text-muted">هنوز فایل متنی مرجعی اضافه نشده است.</div>';
            return;
        }
        dom.projectFilesList.innerHTML = '';
        for (const f of state.draftProjectFiles) {
            const row = document.createElement('div');
            row.className = `project-file-row d-flex justify-content-between align-items-center p-1 rounded border-bottom ${f.id === state.editingProjectFileId ? 'active' : ''}`;
            row.style.cursor = 'pointer';

            const info = document.createElement('span');
            info.className = 'text-truncate';
            info.innerHTML = `<i class="bi bi-file-code me-1"></i>${escapeHtml(f.name)} <small class="text-muted">(${Math.max(1, Math.round((f.size || 0) / 1024))} KB)</small>`;
            info.onclick = () => {
                commitCurrentFileEditorChanges();
                openProjectFileInEditor(f);
            };

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'btn btn-sm btn-outline-danger py-0 px-1 ms-1';
            delBtn.innerHTML = '<i class="bi bi-trash"></i>';
            delBtn.onclick = (e) => {
                e.stopPropagation();
                state.draftProjectFiles = state.draftProjectFiles.filter(x => x.id !== f.id);
                if (state.editingProjectFileId === f.id) {
                    state.editingProjectFileId = null;
                    dom.projectFileEditorPane.classList.add('d-none');
                    dom.projectFileEditorPane.classList.remove('d-flex');
                    dom.projectFileEditorPlaceholder.classList.remove('d-none');
                }
                renderDraftProjectFiles();
            };

            row.appendChild(info);
            row.appendChild(delBtn);
            dom.projectFilesList.appendChild(row);
        }
    }

    // --- ساخت چت و ارسال پیام با پشتیبانی از Stop Generating ---
    async function ensureActiveChat(firstPromptText) {
        let chat = getActiveChat();
        if (!chat) {
            chat = {
                id: crypto.randomUUID(),
                projectId: state.activeProjectId,
                title: firstPromptText.slice(0, 42) || 'گفتگوی جدید',
                thinkingLevel: dom.thinkingLevelSelect.value,
                messages: [],
                createdAt: Date.now()
            };
            state.chats.unshift(chat);
            state.activeChatId = chat.id;
            await dbHelper.put('chats', chat);
            renderSidebar();
        }
        return chat;
    }

    function buildSystemInstruction(project) {
        const parts = [];
        if (project?.instructions?.trim()) {
            parts.push(project.instructions.trim());
        }
        if (project?.files?.length) {
            parts.push('=== فایل‌های مرجع پروژه ===');
            for (const f of project.files) {
                parts.push(`--- File: ${f.name} ---\n${f.content}`);
            }
        }
        return parts.join('\n\n');
    }

    function buildContentsForApi(messages) {
        return messages.map((m) => {
            let textContent = m.text || '';
            if (m.files && m.files.length > 0) {
                const filesBlock = m.files.map(f => `--- Attached File: ${f.name} ---\n${f.content}`).join('\n\n');
                textContent = `${filesBlock}\n\n${textContent}`.trim();
            }
            return {
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: textContent }]
            };
        });
    }

    function setStreamingState(active) {
        state.isStreaming = active;
        if (active) {
            dom.sendBtn.classList.add('d-none');
            dom.stopBtn.classList.remove('d-none');
        } else {
            dom.stopBtn.classList.add('d-none');
            dom.sendBtn.classList.remove('d-none');
            state.abortController = null;
        }
    }

    async function handleSendMessage(e) {
        e.preventDefault();
        if (state.isStreaming) return;

        const promptText = dom.promptInput.value.trim();
        if (!promptText && state.attachedFiles.length === 0) return;

        if (!state.apiKey) {
            apiKeyModal.show();
            return;
        }

        const selectedModel = dom.modelSelect.value;
        if (!selectedModel) {
            alert('ابتدا یک مدل را انتخاب کنید.');
            return;
        }

        const filesSnapshot = [...state.attachedFiles];
        state.attachedFiles = [];
        renderAttachedFilesBar();
        dom.promptInput.value = '';

        const chat = await ensureActiveChat(promptText || filesSnapshot[0]?.name || 'گفتگو');
        chat.thinkingLevel = dom.thinkingLevelSelect.value;

        const userMsg = {
            id: crypto.randomUUID(),
            role: 'user',
            text: promptText,
            files: filesSnapshot,
            pinned: false
        };
        chat.messages.push(userMsg);
        await dbHelper.put('chats', chat);

        if (dom.chatMessages.querySelector('.text-center.text-muted')) {
            dom.chatMessages.innerHTML = '';
        }
        appendMessageElement(userMsg, chat.messages.length - 1);
        updateTokenEstimate();

        const assistantMsg = {
            id: crypto.randomUUID(),
            role: 'model',
            text: 'در حال دریافت پاسخ...',
            files: [],
            pinned: false
        };
        const { bodyDiv, actionsBar, pinBtn } = appendMessageElement(assistantMsg, chat.messages.length);
        dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;

        state.abortController = new AbortController();
        setStreamingState(true);

        let fullReply = '';
        let wasAborted = false;

        try {
            const activeProject = getActiveProject();
            const res = await fetch('/api/chat.php', {
                method: 'POST',
                signal: state.abortController.signal,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Gemini-Api-Key': state.apiKey
                },
                body: JSON.stringify({
                    model: selectedModel,
                    temperature: parseFloat(dom.tempRange.value),
                    thinkingLevel: dom.thinkingLevelSelect.value,
                    systemInstruction: buildSystemInstruction(activeProject),
                    contents: buildContentsForApi(chat.messages)
                })
            });

            if (!res.body) {
                throw new Error('پاسخ استریم از سرور دریافت نشد.');
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let sseBuffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                sseBuffer += decoder.decode(value, { stream: true });
                const events = sseBuffer.split('\n\n');
                sseBuffer = events.pop() || '';

                for (const rawEvent of events) {
                    const lines = rawEvent.split('\n');
                    let eventName = 'message';
                    let dataLine = '';

                    for (const line of lines) {
                        if (line.startsWith('event:')) eventName = line.slice(6).trim();
                        if (line.startsWith('data:')) dataLine += line.slice(5).trim();
                    }

                    if (!dataLine) continue;
                    const parsed = JSON.parse(dataLine);

                    if (eventName === 'error') {
                        throw new Error(parsed.message || 'خطا در اجرای مدل');
                    }
                    if (eventName === 'chunk' && parsed.text) {
                        fullReply += parsed.text;
                        const rendered = renderMarkdownWithTools(fullReply);
                        bodyDiv.innerHTML = rendered.html;
                        bindCodeBlockButtons(bodyDiv);
                        dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
                    }
                    if (eventName === 'usage' && parsed.totalTokenCount) {
                        dom.tokenCountText.textContent = Number(parsed.totalTokenCount).toLocaleString('en-US');
                    }
                }
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                wasAborted = true;
                if (!fullReply) {
                    fullReply = '_تولید پاسخ توسط کاربر متوقف شد._';
                } else {
                    fullReply += '\n\n_[تولید پاسخ متوقف شد]_';
                }
                const rendered = renderMarkdownWithTools(fullReply);
                bodyDiv.innerHTML = rendered.html;
                bindCodeBlockButtons(bodyDiv);
            } else {
                bodyDiv.innerHTML = `<div class="alert alert-danger m-0">${escapeHtml(err.message)}</div>`;
                setStreamingState(false);
                return;
            }
        }

        assistantMsg.text = fullReply;
        chat.messages.push(assistantMsg);
        await dbHelper.put('chats', chat);

        const finalRendered = renderMarkdownWithTools(fullReply);
        if (finalRendered.extractedFiles.length > 0 && !actionsBar.querySelector('.btn-outline-primary')) {
            const zipAllBtn = document.createElement('button');
            zipAllBtn.type = 'button';
            zipAllBtn.className = 'btn btn-sm btn-outline-primary py-0 px-2';
            zipAllBtn.innerHTML = `<i class="bi bi-file-zip-fill me-1"></i>دانلود کل کدها (${finalRendered.extractedFiles.length} فایل ZIP)`;
            zipAllBtn.onclick = () => downloadFilesAsZip(finalRendered.extractedFiles, `gemini-response-${chat.messages.length}.zip`);
            actionsBar.insertBefore(zipAllBtn, pinBtn);
        }

        setStreamingState(false);
        if (!wasAborted) {
            updateTokenEstimate();
        }
    }

    // --- رویدادها ---
    dom.toggleSidebarBtn.addEventListener('click', () => {
        dom.sidebar.classList.toggle('show');
    });

    dom.tempRange.addEventListener('input', () => {
        dom.tempValue.textContent = dom.tempRange.value;
    });

    dom.modelSelect.addEventListener('change', () => {
        const chat = getActiveChat();
        if (!chat || chat.thinkingLevel === undefined) {
            syncThinkingAndModelUI();
        }
        updateTokenEstimate();
    });

    dom.thinkingLevelSelect.addEventListener('change', async () => {
        const chat = getActiveChat();
        if (chat) {
            chat.thinkingLevel = dom.thinkingLevelSelect.value;
            await dbHelper.put('chats', chat);
        }
    });

    dom.saveModelThinkingBtn.addEventListener('click', () => {
        const modelId = dom.modelSelect.value;
        if (!modelId) return;
        const level = dom.thinkingLevelSelect.value;
        if (level) {
            state.modelThinkingDefaults[modelId] = level;
        } else {
            delete state.modelThinkingDefaults[modelId];
        }
        saveModelThinkingDefaults();
        const origHtml = dom.saveModelThinkingBtn.innerHTML;
        dom.saveModelThinkingBtn.innerHTML = '<i class="bi bi-check2 text-success"></i>';
        setTimeout(() => { dom.saveModelThinkingBtn.innerHTML = origHtml; }, 1200);
    });

    dom.stopBtn.addEventListener('click', () => {
        if (state.abortController) {
            state.abortController.abort();
        }
    });

    dom.togglePinnedDrawerBtn.addEventListener('click', () => {
        dom.pinnedMessagesPanel.classList.toggle('d-none');
    });

    dom.closePinnedPanelBtn.addEventListener('click', () => {
        dom.pinnedMessagesPanel.classList.add('d-none');
    });

    dom.promptSnippetsBar.querySelectorAll('.snippet-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.snippet;
            if (BUILTIN_SNIPPETS[key]) {
                insertSnippetIntoPrompt(BUILTIN_SNIPPETS[key]);
            }
        });
    });

    dom.manageSnippetsBtn.addEventListener('click', () => {
        dom.newSnippetTitle.value = '';
        dom.newSnippetPrompt.value = '';
        customSnippetModal.show();
    });

    dom.saveCustomSnippetBtn.addEventListener('click', () => {
        const title = dom.newSnippetTitle.value.trim();
        const prompt = dom.newSnippetPrompt.value.trim();
        if (!title || !prompt) {
            alert('عنوان و متن قالب الزامی است.');
            return;
        }
        state.customSnippets.push({ title, prompt });
        localStorage.setItem(STORAGE_CUSTOM_SNIPPETS, JSON.stringify(state.customSnippets));
        renderCustomSnippets();
        customSnippetModal.hide();
    });

    dom.promptInput.addEventListener('input', updateTokenEstimate);

    dom.promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            dom.chatForm.requestSubmit();
        }
    });

    dom.chatForm.addEventListener('submit', handleSendMessage);

    dom.newProjectBtn.addEventListener('click', () => openProjectModal(null));

    dom.newChatBtn.addEventListener('click', () => {
        state.activeChatId = null;
        const proj = getActiveProject();
        if (proj) {
            applyProjectProfileToUI(proj);
        } else {
            syncThinkingAndModelUI();
        }
        renderSidebar();
        renderMessages();
        updateTokenEstimate();
    });

    dom.refreshModelsBtn.addEventListener('click', () => {
        if (!state.apiKey) {
            apiKeyModal.show();
            return;
        }
        fetchModelsFromServer(true);
    });

    dom.saveApiKeyBtn.addEventListener('click', async () => {
        const key = dom.apiKeyInput.value.trim();
        if (!key) {
            alert('لطفاً کلید API را وارد کنید.');
            return;
        }
        saveApiKey(key, dom.rememberKeyCheck.checked);
        apiKeyModal.hide();
        await fetchModelsFromServer(true);
    });

    dom.clearApiKeyBtn.addEventListener('click', () => {
        dom.apiKeyInput.value = '';
        saveApiKey('', false);
        localStorage.removeItem(STORAGE_MODELS_CACHE);
        dom.modelSelect.innerHTML = '<option value="">در انتظار API Key...</option>';
    });

    dom.projectFilesInput.addEventListener('change', async (e) => {
        commitCurrentFileEditorChanges();
        for (const file of e.target.files || []) {
            try {
                const parsedFile = await readTextFile(file);
                state.draftProjectFiles.push(parsedFile);
            } catch (err) {
                alert(err.message);
            }
        }
        e.target.value = '';
        renderDraftProjectFiles();
        if (state.draftProjectFiles.length > 0 && !state.editingProjectFileId) {
            openProjectFileInEditor(state.draftProjectFiles[state.draftProjectFiles.length - 1]);
        }
    });

    dom.createEmptyProjectFileBtn.addEventListener('click', () => {
        commitCurrentFileEditorChanges();
        const newFile = {
            id: crypto.randomUUID(),
            name: `file-${state.draftProjectFiles.length + 1}.php`,
            size: 0,
            content: '<?php\n'
        };
        state.draftProjectFiles.push(newFile);
        openProjectFileInEditor(newFile);
    });

    dom.applyProjectFileEditBtn.addEventListener('click', () => {
        commitCurrentFileEditorChanges();
        const orig = dom.applyProjectFileEditBtn.textContent;
        dom.applyProjectFileEditBtn.textContent = 'اعمال شد ✓';
        setTimeout(() => { dom.applyProjectFileEditBtn.textContent = orig; }, 1000);
    });

    dom.saveProjectBtn.addEventListener('click', async () => {
        commitCurrentFileEditorChanges();
        const name = dom.projectNameInput.value.trim();
        if (!name) {
            alert('نام پروژه الزامی است.');
            return;
        }
        const existingId = dom.projectIdInput.value;
        const projectObj = {
            id: existingId || crypto.randomUUID(),
            name,
            defaultModel: dom.projectDefaultModelSelect.value,
            defaultThinking: dom.projectDefaultThinkingSelect.value,
            defaultTemp: dom.projectDefaultTempInput.value.trim(),
            instructions: dom.projectInstructionsInput.value,
            files: state.draftProjectFiles,
            updatedAt: Date.now()
        };

        await dbHelper.put('projects', projectObj);

        if (existingId) {
            state.projects = state.projects.map(p => p.id === existingId ? projectObj : p);
        } else {
            state.projects.push(projectObj);
        }

        state.activeProjectId = projectObj.id;
        applyProjectProfileToUI(projectObj);
        projectModal.hide();
        renderSidebar();
        renderMessages();
        updateContextBadge();
        updateTokenEstimate();
    });

    dom.chatTextFileInput.addEventListener('change', async (e) => {
        for (const file of e.target.files || []) {
            try {
                const parsedFile = await readTextFile(file);
                state.attachedFiles.push(parsedFile);
            } catch (err) {
                alert(err.message);
            }
        }
        e.target.value = '';
        renderAttachedFilesBar();
    });

    dom.exportDataBtn.addEventListener('click', () => {
        const payload = {
            exportedAt: new Date().toISOString(),
            modelThinkingDefaults: state.modelThinkingDefaults,
            customSnippets: state.customSnippets,
            projects: state.projects,
            chats: state.chats
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gemini-projects-backup-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });

    dom.importDataInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            if (!Array.isArray(parsed.projects) || !Array.isArray(parsed.chats)) {
                throw new Error('فایل بکاپ معتبر نیست.');
            }
            await dbHelper.clearAndImport(parsed);
            state.projects = parsed.projects;
            state.chats = parsed.chats;
            if (parsed.modelThinkingDefaults) {
                state.modelThinkingDefaults = parsed.modelThinkingDefaults;
                saveModelThinkingDefaults();
            }
            if (Array.isArray(parsed.customSnippets)) {
                state.customSnippets = parsed.customSnippets;
                localStorage.setItem(STORAGE_CUSTOM_SNIPPETS, JSON.stringify(state.customSnippets));
                renderCustomSnippets();
            }
            state.activeProjectId = null;
            state.activeChatId = state.chats[0]?.id || null;
            renderSidebar();
            renderMessages();
            updateContextBadge();
            updateTokenEstimate();
            alert('اطلاعات با موفقیت بازیابی شد.');
        } catch (err) {
            alert(err.message);
        } finally {
            e.target.value = '';
        }
    });

    async function init() {
        loadSavedApiKey();
        loadPreferences();
        state.projects = await dbHelper.getAll('projects');
        state.chats = (await dbHelper.getAll('chats')).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        if (state.chats.length > 0) {
            state.activeChatId = state.chats[0].id;
            state.activeProjectId = state.chats[0].projectId || null;
        }

        if (state.apiKey) {
            await fetchModelsFromServer(false);
        } else {
            apiKeyModal.show();
        }

        const activeProj = getActiveProject();
        if (activeProj) applyProjectProfileToUI(activeProj);
        syncThinkingAndModelUI();
        renderSidebar();
        renderMessages();
        updateContextBadge();
        updateTokenEstimate();
    }

    init();
})();
