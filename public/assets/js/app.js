(() => {
    const STORAGE_KEY_PERSIST = 'gemini_enc_key_local';
    const STORAGE_KEY_SESSION = 'gemini_enc_key_session';
    const STORAGE_MODELS_CACHE = 'gemini_models_cache_v1';
    const SECRET_SALT = 'GeminiCodeClient::LocalObfuscation::v1';

    let state = {
        apiKey: '',
        projects: [],
        chats: [],
        activeProjectId: null,
        activeChatId: null,
        attachedFiles: [],
        draftProjectFiles: [],
        isStreaming: false
    };

    const dom = {
        sidebar: document.getElementById('sidebar'),
        toggleSidebarBtn: document.getElementById('toggleSidebarBtn'),
        sidebarContent: document.getElementById('sidebarContent'),
        newProjectBtn: document.getElementById('newProjectBtn'),
        newChatBtn: document.getElementById('newChatBtn'),
        activeContextBadge: document.getElementById('activeContextBadge'),
        modelSelect: document.getElementById('modelSelect'),
        refreshModelsBtn: document.getElementById('refreshModelsBtn'),
        tempRange: document.getElementById('tempRange'),
        tempValue: document.getElementById('tempValue'),
        chatMessages: document.getElementById('chatMessages'),
        attachedFilesBar: document.getElementById('attachedFilesBar'),
        chatTextFileInput: document.getElementById('chatTextFileInput'),
        chatForm: document.getElementById('chatForm'),
        promptInput: document.getElementById('promptInput'),
        sendBtn: document.getElementById('sendBtn'),
        apiKeyInput: document.getElementById('apiKeyInput'),
        rememberKeyCheck: document.getElementById('rememberKeyCheck'),
        saveApiKeyBtn: document.getElementById('saveApiKeyBtn'),
        clearApiKeyBtn: document.getElementById('clearApiKeyBtn'),
        projectModalTitle: document.getElementById('projectModalTitle'),
        projectIdInput: document.getElementById('projectIdInput'),
        projectNameInput: document.getElementById('projectNameInput'),
        projectInstructionsInput: document.getElementById('projectInstructionsInput'),
        projectFilesInput: document.getElementById('projectFilesInput'),
        projectFilesList: document.getElementById('projectFilesList'),
        saveProjectBtn: document.getElementById('saveProjectBtn'),
        exportDataBtn: document.getElementById('exportDataBtn'),
        importDataInput: document.getElementById('importDataInput'),
    };

    const apiKeyModal = new bootstrap.Modal(document.getElementById('apiKeyModal'));
    const projectModal = new bootstrap.Modal(document.getElementById('projectModal'));

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

    function readTextFile(file) {
        return new Promise((resolve, reject) => {
            if (file.size > 2 * 1024 * 1024) {
                reject(new Error(`حجم فایل "${file.name}" بیشتر از ۲ مگابایت است.`));
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

    async function fetchModelsFromServer(forceRefresh = false) {
        if (!forceRefresh) {
            const cached = localStorage.getItem(STORAGE_MODELS_CACHE);
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    if (Array.isArray(parsed.models) && parsed.models.length > 0) {
                        populateModelSelect(parsed.models);
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
            const models = data.models || [];
            localStorage.setItem(STORAGE_MODELS_CACHE, JSON.stringify({
                updatedAt: Date.now(),
                models
            }));
            populateModelSelect(models);
        } catch (err) {
            alert(err.message);
        } finally {
            dom.refreshModelsBtn.disabled = false;
        }
    }

    function populateModelSelect(models) {
        const previous = dom.modelSelect.value;
        dom.modelSelect.innerHTML = '';

        if (!models.length) {
            dom.modelSelect.innerHTML = '<option value="">مدلی یافت نشد</option>';
            return;
        }

        for (const m of models) {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.displayName ? `${m.displayName} (${m.id})` : m.id;
            dom.modelSelect.appendChild(opt);
        }

        if (previous && models.some(m => m.id === previous)) {
            dom.modelSelect.value = previous;
        } else {
            const preferred = models.find(m => m.id.includes('2.5-pro')) || models.find(m => m.id.includes('2.5-flash')) || models[0];
            if (preferred) dom.modelSelect.value = preferred.id;
        }
    }

    function renderMarkdownSafe(mdText) {
        const rawHtml = marked.parse(mdText || '');
        const container = document.createElement('div');
        container.innerHTML = rawHtml;

        container.querySelectorAll('pre').forEach((pre) => {
            const codeEl = pre.querySelector('code');
            const langClass = codeEl ? [...codeEl.classList].find(c => c.startsWith('language-')) : '';
            const langName = langClass ? langClass.replace('language-', '') : 'code';

            if (codeEl && window.hljs) {
                window.hljs.highlightElement(codeEl);
            }

            const wrapper = document.createElement('div');
            wrapper.className = 'code-block-wrapper';

            const header = document.createElement('div');
            header.className = 'code-block-header';

            const langSpan = document.createElement('span');
            langSpan.textContent = langName;

            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'btn btn-sm btn-dark py-0 px-2 border border-secondary';
            copyBtn.innerHTML = '<i class="bi bi-clipboard"></i> کپی';
            copyBtn.addEventListener('click', async () => {
                const textToCopy = codeEl ? codeEl.innerText : pre.innerText;
                await navigator.clipboard.writeText(textToCopy);
                copyBtn.innerHTML = '<i class="bi bi-check2 text-success"></i> کپی شد';
                setTimeout(() => {
                    copyBtn.innerHTML = '<i class="bi bi-clipboard"></i> کپی';
                }, 1500);
            });

            header.appendChild(langSpan);
            header.appendChild(copyBtn);

            pre.parentNode.insertBefore(wrapper, pre);
            wrapper.appendChild(header);
            wrapper.appendChild(pre);
        });

        return container.innerHTML;
    }

    function getActiveProject() {
        return state.projects.find(p => p.id === state.activeProjectId) || null;
    }

    function getActiveChat() {
        return state.chats.find(c => c.id === state.activeChatId) || null;
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
        titleSpan.textContent = title;
        header.appendChild(titleSpan);

        if (projectObj) {
            const actions = document.createElement('div');
            actions.className = 'd-flex gap-1';

            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'btn btn-link btn-sm text-info p-0';
            editBtn.title = 'ویرایش پروژه و فایل‌ها';
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
            };

            item.onclick = () => {
                state.activeProjectId = projectId;
                state.activeChatId = chat.id;
                renderSidebar();
                renderMessages();
                updateContextBadge();
                dom.sidebar.classList.remove('show');
            };

            item.appendChild(label);
            item.appendChild(delChatBtn);
            box.appendChild(item);
        }

        dom.sidebarContent.appendChild(box);
    }

    function renderMessages() {
        dom.chatMessages.innerHTML = '';
        const chat = getActiveChat();

        if (!chat || !chat.messages || chat.messages.length === 0) {
            dom.chatMessages.innerHTML = `
                <div class="text-center text-muted mt-5">
                    <i class="bi bi-terminal fs-1 d-block mb-2"></i>
                    <p>پیام خود را بنویسید یا یک فایل متنی به گفتگو اضافه کنید.</p>
                </div>`;
            return;
        }

        for (const msg of chat.messages) {
            appendMessageElement(msg.role, msg.text, msg.files || []);
        }
        dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
    }

    function appendMessageElement(role, text, files = []) {
        const row = document.createElement('div');
        row.className = 'd-flex mb-3 justify-content-start';

        const card = document.createElement('div');
        card.className = `message-card w-100 p-3 ${role === 'user' ? 'message-user' : 'message-assistant'}`;

        const roleBadge = document.createElement('div');
        roleBadge.className = 'small fw-bold mb-2 text-secondary';
        roleBadge.textContent = role === 'user' ? 'شما' : 'Gemini';
        card.appendChild(roleBadge);

        if (files && files.length > 0) {
            const filesBox = document.createElement('div');
            filesBox.className = 'mb-2 d-flex flex-wrap gap-1';
            for (const f of files) {
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
            p.textContent = text;
            bodyDiv.appendChild(p);
        } else {
            bodyDiv.innerHTML = renderMarkdownSafe(text);
        }

        card.appendChild(bodyDiv);
        row.appendChild(card);
        dom.chatMessages.appendChild(row);
        return bodyDiv;
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
    }

    function openProjectModal(project = null) {
        if (project) {
            dom.projectModalTitle.textContent = 'ویرایش پروژه';
            dom.projectIdInput.value = project.id;
            dom.projectNameInput.value = project.name;
            dom.projectInstructionsInput.value = project.instructions || '';
            state.draftProjectFiles = structuredClone(project.files || []);
        } else {
            dom.projectModalTitle.textContent = 'پروژه جدید';
            dom.projectIdInput.value = '';
            dom.projectNameInput.value = '';
            dom.projectInstructionsInput.value = '';
            state.draftProjectFiles = [];
        }
        renderDraftProjectFiles();
        projectModal.show();
    }

    function renderDraftProjectFiles() {
        if (!state.draftProjectFiles.length) {
            dom.projectFilesList.innerHTML = '<div class="text-muted">هنوز فایل متنی مرجعی اضافه نشده است.</div>';
            return;
        }
        dom.projectFilesList.innerHTML = '';
        for (const f of state.draftProjectFiles) {
            const row = document.createElement('div');
            row.className = 'd-flex justify-content-between align-items-center py-1 border-bottom';
            row.innerHTML = `<span><i class="bi bi-file-code me-1"></i><strong>${escapeHtml(f.name)}</strong> (${Math.max(1, Math.round(f.size / 1024))} KB)</span>`;

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'btn btn-sm btn-outline-danger py-0 px-1';
            delBtn.innerHTML = '<i class="bi bi-trash"></i>';
            delBtn.onclick = () => {
                state.draftProjectFiles = state.draftProjectFiles.filter(x => x.id !== f.id);
                renderDraftProjectFiles();
            };
            row.appendChild(delBtn);
            dom.projectFilesList.appendChild(row);
        }
    }

    async function ensureActiveChat(firstPromptText) {
        let chat = getActiveChat();
        if (!chat) {
            chat = {
                id: crypto.randomUUID(),
                projectId: state.activeProjectId,
                title: firstPromptText.slice(0, 40) || 'گفتگوی جدید',
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
        const userMsg = { role: 'user', text: promptText, files: filesSnapshot };
        chat.messages.push(userMsg);
        await dbHelper.put('chats', chat);

        if (dom.chatMessages.querySelector('.text-center.text-muted')) {
            dom.chatMessages.innerHTML = '';
        }
        appendMessageElement('user', userMsg.text, userMsg.files);

        const assistantBodyEl = appendMessageElement('assistant', 'در حال دریافت پاسخ...');
        dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;

        state.isStreaming = true;
        dom.sendBtn.disabled = true;

        let fullReply = '';

        try {
            const activeProject = getActiveProject();
            const res = await fetch('/api/chat.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Gemini-Api-Key': state.apiKey
                },
                body: JSON.stringify({
                    model: selectedModel,
                    temperature: parseFloat(dom.tempRange.value),
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
                        assistantBodyEl.innerHTML = renderMarkdownSafe(fullReply);
                        dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
                    }
                }
            }

            chat.messages.push({ role: 'model', text: fullReply, files: [] });
            await dbHelper.put('chats', chat);

        } catch (err) {
            assistantBodyEl.innerHTML = `<div class="alert alert-danger m-0">${escapeHtml(err.message)}</div>`;
        } finally {
            state.isStreaming = false;
            dom.sendBtn.disabled = false;
        }
    }

    dom.toggleSidebarBtn.addEventListener('click', () => {
        dom.sidebar.classList.toggle('show');
    });

    dom.tempRange.addEventListener('input', () => {
        dom.tempValue.textContent = dom.tempRange.value;
    });

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
        renderSidebar();
        renderMessages();
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
    });

    dom.saveProjectBtn.addEventListener('click', async () => {
        const name = dom.projectNameInput.value.trim();
        if (!name) {
            alert('نام پروژه الزامی است.');
            return;
        }
        const existingId = dom.projectIdInput.value;
        const projectObj = {
            id: existingId || crypto.randomUUID(),
            name,
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
        state.activeChatId = null;
        projectModal.hide();
        renderSidebar();
        renderMessages();
        updateContextBadge();
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
            state.activeProjectId = null;
            state.activeChatId = state.chats[0]?.id || null;
            renderSidebar();
            renderMessages();
            updateContextBadge();
            alert('اطلاعات با موفقیت بازیابی شد.');
        } catch (err) {
            alert(err.message);
        } finally {
            e.target.value = '';
        }
    });

    async function init() {
        loadSavedApiKey();
        state.projects = await dbHelper.getAll('projects');
        state.chats = (await dbHelper.getAll('chats')).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        if (state.chats.length > 0) {
            state.activeChatId = state.chats[0].id;
            state.activeProjectId = state.chats[0].projectId || null;
        }
        renderSidebar();
        renderMessages();
        updateContextBadge();

        if (state.apiKey) {
            fetchModelsFromServer(false);
        } else {
            apiKeyModal.show();
        }
    }

    init();
})();
