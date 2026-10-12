document.addEventListener('DOMContentLoaded', () => {
    // ─── DOM Refs ────────────────────────────────────────────────────────────
    const form              = document.getElementById('generate-form');
    const fallbackInput     = document.getElementById('fallback-input');
    const fallbackBtn       = document.getElementById('fallback-submit-btn');
    const urlError          = document.getElementById('url-error');
    const loading           = document.getElementById('loading');
    const loadingText       = document.getElementById('loading-text');
    const loadingSub        = document.getElementById('loading-sub');
    const results           = document.getElementById('results');
    const ideasContainer    = document.getElementById('ideas-container');
    const quotesContainer   = document.getElementById('quotes-container');
    const reactionsContainer= document.getElementById('reactions-container');
    const articleTitle      = document.getElementById('article-title');
    const articleThesis     = document.getElementById('article-thesis');

    let currentData = null;

    // ─── Loading Message Cycling ─────────────────────────────────────────────
    const loadingMessages = [
        { text: 'Fetching the article...', sub: 'Reading the source content.' },
        { text: 'Extracting key insights...', sub: 'Identifying the core thesis and arguments.' },
        { text: 'Brainstorming hooks...', sub: 'Crafting attention-grabbing openers.' },
        { text: 'Drafting scripts...', sub: 'Writing platform-specific content formats.' },
        { text: 'Finalizing your ideas...', sub: 'Almost done — polishing everything up.' },
    ];
    let loadingMsgInterval = null;

    function startLoadingCycle() {
        let idx = 0;
        loadingText.textContent = loadingMessages[0].text;
        loadingSub.textContent  = loadingMessages[0].sub;
        loadingMsgInterval = setInterval(() => {
            idx = (idx + 1) % loadingMessages.length;
            loadingText.style.opacity = '0';
            setTimeout(() => {
                loadingText.textContent = loadingMessages[idx].text;
                loadingSub.textContent  = loadingMessages[idx].sub;
                loadingText.style.opacity = '1';
            }, 300);
        }, 3500);
    }

    function stopLoadingCycle() {
        clearInterval(loadingMsgInterval);
    }

    // ─── Brand Voice Presets ─────────────────────────────────────────────────
    document.querySelectorAll('.preset-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const ta = document.getElementById('brand_voice');
            ta.value = chip.dataset.preset;
            ta.focus();
            // Quick flash to confirm
            chip.style.background = 'rgba(139, 92, 246, 0.35)';
            setTimeout(() => { chip.style.background = ''; }, 600);
        });
    });

    // ─── Form Submit ─────────────────────────────────────────────────────────
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const url = document.getElementById('url').value;
        if (!url) return;
        await generate({ url });
    });

    fallbackBtn.addEventListener('click', async () => {
        const text = document.getElementById('pasted-text').value;
        if (!text) return;
        const url = document.getElementById('url').value;
        await generate({ url, text });
    });

    async function generate(payload) {
        payload.tone        = document.getElementById('tone').value;
        payload.num_ideas   = document.getElementById('num_ideas').value;
        payload.audience    = document.getElementById('audience').value;
        payload.brand_voice = document.getElementById('brand_voice').value.trim();

        const checkboxes  = document.querySelectorAll('input[name="platforms"]:checked');
        payload.platforms = Array.from(checkboxes).map(cb => cb.value);

        if (payload.platforms.length === 0) {
            alert('Please select at least one platform.');
            return;
        }

        // UI state
        form.classList.add('hidden');
        loading.classList.remove('hidden');
        results.classList.add('hidden');
        fallbackInput.classList.add('hidden');
        urlError.textContent = '';
        startLoadingCycle();

        try {
            const res  = await fetch('/api/generate', {
                method : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body   : JSON.stringify(payload),
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Something went wrong');

            currentData = data;
            renderResults(data);
            saveToHistory(data, payload);

            loading.classList.add('hidden');
            results.classList.remove('hidden');
            form.classList.remove('hidden');

        } catch (err) {
            loading.classList.add('hidden');
            form.classList.remove('hidden');
            fallbackInput.classList.remove('hidden');
            urlError.textContent = err.message;
            if (payload.text) alert('Generation failed: ' + err.message);
        } finally {
            stopLoadingCycle();
        }
    }

    // ─── Render Results ───────────────────────────────────────────────────────
    function renderResults(data) {
        articleTitle.textContent  = data.title ? `Ideas for: ${data.title}` : 'Generated Ideas';
        articleThesis.textContent = data.thesis || 'N/A';

        ideasContainer.innerHTML = '';
        if (data.ideas && data.ideas.length) {
            data.ideas.forEach((idea) => {
                const card = document.createElement('div');
                card.className = 'idea-card';

                let badgesHtml = `<span class="badge">${escapeHtml(idea.platform)}</span>`;
                if (idea.needs_verification) {
                    badgesHtml += ` <span class="badge verify-badge" title="Needs Verification">Verify</span>`;
                }
                if (idea.credit_source) {
                    badgesHtml += ` <span class="badge credit-badge" title="${escapeHtml(idea.credit_line || 'Credit original')}">Credit</span>`;
                }

                let bodyHtml   = '';
                let markdownText = `**Platform:** ${idea.platform}\n**Angle:** ${idea.angle_type}\n**Hook:** ${idea.hook}\n\n`;

                if (['reel', 'tiktok', 'short'].includes(idea.platform) && idea.script_beats) {
                    bodyHtml += `<table><tr><th>Time</th><th>Visual</th><th>Audio/Text</th></tr>`;
                    idea.script_beats.forEach(beat => {
                        bodyHtml += `<tr>
                            <td>${escapeHtml(beat.time)}</td>
                            <td>${escapeHtml(beat.visual)}</td>
                            <td>${escapeHtml(beat.voiceover || beat.on_screen_text)}</td>
                        </tr>`;
                        markdownText += `- ${beat.time}: [Visual: ${beat.visual}] ${beat.voiceover || beat.on_screen_text}\n`;
                    });
                    bodyHtml += `</table>`;
                } else if (idea.platform === 'carousel' && idea.slides) {
                    const ol = document.createElement('ol');
                    idea.slides.forEach(s => {
                        const li = document.createElement('li');
                        li.textContent = s.text;
                        ol.appendChild(li);
                        markdownText += `${s.slide}. ${s.text}\n`;
                    });
                    bodyHtml += ol.outerHTML;
                } else if (['linkedin', 'x_post'].includes(idea.platform) && idea.post_text) {
                    bodyHtml += `<p style="white-space: pre-wrap;">${escapeHtml(idea.post_text)}</p>`;
                    markdownText += `${idea.post_text}\n`;
                } else if (idea.platform === 'x_thread' && idea.thread) {
                    const ol = document.createElement('ol');
                    idea.thread.forEach(t => {
                        const li = document.createElement('li');
                        li.textContent = t;
                        ol.appendChild(li);
                        markdownText += `${ol.children.length}. ${t}\n`;
                    });
                    bodyHtml += ol.outerHTML;
                }

                if (idea.cta)                           markdownText += `\n**CTA:** ${idea.cta}`;
                if (idea.caption)                       markdownText += `\n**Caption:** ${idea.caption}`;
                if (idea.hashtags && idea.hashtags.length) markdownText += `\n**Tags:** ${idea.hashtags.join(' ')}`;

                card.innerHTML = `
                    <div class="card-header">
                        <div class="badge-container">
                            ${badgesHtml}
                            <span class="badge" style="background:transparent;border:1px solid var(--border-color);">${escapeHtml(idea.angle_type)}</span>
                        </div>
                    </div>
                    <h3>${escapeHtml(idea.title || 'Idea')}</h3>
                    <div class="hook">${escapeHtml(idea.hook || '')}</div>
                    <div class="content-body">${bodyHtml}</div>
                    <div style="font-size:0.85rem; color:var(--text-muted);">
                        <strong>Why it works:</strong> ${escapeHtml(idea.why_it_works || '')}
                    </div>
                `;

                const btn = document.createElement('button');
                btn.className = 'copy-btn outline-btn';
                btn.innerHTML = '<i data-lucide="copy"></i> Copy';
                btn.onclick = () => {
                    navigator.clipboard.writeText(markdownText);
                    btn.innerHTML = '<i data-lucide="check"></i> Copied!';
                    if (window.lucide) window.lucide.createIcons({ root: btn });
                    setTimeout(() => {
                        btn.innerHTML = '<i data-lucide="copy"></i> Copy';
                        if (window.lucide) window.lucide.createIcons({ root: btn });
                    }, 2000);
                };
                card.appendChild(btn);
                ideasContainer.appendChild(card);
            });
        }

        // Quotes
        quotesContainer.innerHTML = '';
        if (data.quote_cards && data.quote_cards.length) {
            const ul = document.createElement('ul');
            data.quote_cards.forEach(q => {
                const li = document.createElement('li');
                li.textContent = `"${q.text}"`;
                ul.appendChild(li);
            });
            quotesContainer.appendChild(ul);
        }

        // Reactions
        reactionsContainer.innerHTML = '';
        if (data.reaction_angles && data.reaction_angles.length) {
            const ul = document.createElement('ul');
            data.reaction_angles.forEach(r => {
                const li = document.createElement('li');
                li.innerHTML = `<strong>${escapeHtml(r.angle)}:</strong> ${escapeHtml(r.opening_line)}`;
                ul.appendChild(li);
            });
            reactionsContainer.appendChild(ul);
        }

        if (window.lucide) window.lucide.createIcons({ root: document.getElementById('results') });
    }

    // ─── Build Full Markdown ──────────────────────────────────────────────────
    function buildFullMarkdown(data) {
        let md = `# Ideas for: ${data.title || 'Article'}\n\n`;
        md += `**Core Thesis:** ${data.thesis || ''}\n\n---\n\n`;

        (data.ideas || []).forEach((idea, i) => {
            md += `## ${i + 1}. ${idea.title} (${idea.platform})\n`;
            md += `**Angle:** ${idea.angle_type}\n`;
            md += `**Hook:** ${idea.hook}\n\n`;

            if (idea.script_beats) {
                idea.script_beats.forEach(b => {
                    md += `- ${b.time}: [Visual: ${b.visual}] ${b.voiceover || b.on_screen_text}\n`;
                });
            } else if (idea.slides) {
                idea.slides.forEach(s => { md += `${s.slide}. ${s.text}\n`; });
            } else if (idea.post_text) {
                md += `${idea.post_text}\n`;
            } else if (idea.thread) {
                idea.thread.forEach((t, idx) => { md += `${idx + 1}. ${t}\n`; });
            }

            if (idea.cta)                              md += `\n**CTA:** ${idea.cta}`;
            if (idea.caption)                          md += `\n**Caption:** ${idea.caption}`;
            if (idea.hashtags && idea.hashtags.length) md += `\n**Tags:** ${idea.hashtags.join(' ')}`;
            md += '\n\n';
        });
        return md;
    }

    // ─── Copy All MD ─────────────────────────────────────────────────────────
    document.getElementById('copy-all-btn').addEventListener('click', () => {
        if (!currentData) return;
        const md  = buildFullMarkdown(currentData);
        navigator.clipboard.writeText(md);
        const btn = document.getElementById('copy-all-btn');
        btn.innerHTML = '<i data-lucide="check"></i> Copied All!';
        if (window.lucide) window.lucide.createIcons({ root: btn });
        setTimeout(() => {
            btn.innerHTML = '<i data-lucide="copy"></i> Copy All MD';
            if (window.lucide) window.lucide.createIcons({ root: btn });
        }, 2000);
    });

    // ─── Export Dropdown ──────────────────────────────────────────────────────
    const exportWrapper = document.getElementById('export-dropdown-wrapper');
    const exportTrigger = document.getElementById('export-trigger-btn');

    exportTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        exportWrapper.classList.toggle('open');
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!exportWrapper.contains(e.target)) {
            exportWrapper.classList.remove('open');
        }
    });

    function downloadFile(content, filename, mime) {
        const blob = new Blob([content], { type: mime });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        exportWrapper.classList.remove('open');
    }

    function safeFilename(title) {
        return (title || 'content-ideas')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 40);
    }

    document.getElementById('export-txt-btn').addEventListener('click', () => {
        if (!currentData) return;
        const md   = buildFullMarkdown(currentData);
        // Strip markdown markers for plain text
        const txt  = md
            .replace(/#{1,6}\s/g, '')
            .replace(/\*\*/g, '')
            .replace(/\*/g, '');
        downloadFile(txt, `${safeFilename(currentData.title)}.txt`, 'text/plain');
    });

    document.getElementById('export-md-btn').addEventListener('click', () => {
        if (!currentData) return;
        downloadFile(buildFullMarkdown(currentData), `${safeFilename(currentData.title)}.md`, 'text/markdown');
    });

    document.getElementById('export-csv-btn').addEventListener('click', () => {
        if (!currentData || !currentData.ideas) return;
        const rows = [['#', 'Platform', 'Angle', 'Title', 'Hook', 'Why It Works', 'CTA', 'Hashtags']];
        currentData.ideas.forEach((idea, i) => {
            rows.push([
                i + 1,
                idea.platform    || '',
                idea.angle_type  || '',
                idea.title       || '',
                idea.hook        || '',
                idea.why_it_works|| '',
                idea.cta         || '',
                (idea.hashtags || []).join(' '),
            ].map(v => `"${String(v).replace(/"/g, '""')}"`));
        });
        const csv = rows.map(r => r.join(',')).join('\n');
        downloadFile(csv, `${safeFilename(currentData.title)}.csv`, 'text/csv');
    });

    // ─── History (localStorage) ───────────────────────────────────────────────
    const HISTORY_KEY = 'contentgen_history';
    const MAX_HISTORY = 20;

    function getHistory() {
        try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
        catch { return []; }
    }

    function saveHistory(items) {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
    }

    function saveToHistory(data, payload) {
        const history = getHistory();
        const entry   = {
            id         : Date.now(),
            timestamp  : new Date().toISOString(),
            title      : data.title || payload.url || 'Untitled',
            url        : payload.url || '',
            ideas_count: (data.ideas || []).length,
            data,
        };
        history.unshift(entry);
        if (history.length > MAX_HISTORY) history.pop();
        saveHistory(history);
        renderHistoryList();
    }

    function renderHistoryList() {
        const history    = getHistory();
        const historyList= document.getElementById('history-list');
        const badge      = document.getElementById('history-count-badge');

        if (history.length === 0) {
            historyList.innerHTML = '<p class="history-empty">No history yet. Generate your first idea batch!</p>';
            badge.classList.add('hidden');
            return;
        }

        badge.textContent = history.length;
        badge.classList.remove('hidden');

        historyList.innerHTML = '';
        history.forEach(entry => {
            const item = document.createElement('div');
            item.className = 'history-item';
            const time = new Date(entry.timestamp).toLocaleString(undefined, {
                month: 'short', day: 'numeric',
                hour : '2-digit', minute: '2-digit',
            });
            item.innerHTML = `
                <div class="history-item-title">${escapeHtml(entry.title)}</div>
                <div class="history-item-meta">
                    <span class="history-item-time">${time}</span>
                    <span class="history-item-count">${entry.ideas_count} ideas</span>
                </div>
            `;
            item.addEventListener('click', () => {
                currentData = entry.data;
                renderResults(entry.data);
                results.classList.remove('hidden');
                form.classList.remove('hidden');
                loading.classList.add('hidden');
                // Collapse sidebar after selecting on mobile (not relevant on desktop)
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
            historyList.appendChild(item);
        });

        if (window.lucide) window.lucide.createIcons({ root: document.getElementById('history-sidebar') });
    }

    document.getElementById('history-clear-btn').addEventListener('click', () => {
        if (!confirm('Clear all history? This cannot be undone.')) return;
        saveHistory([]);
        renderHistoryList();
    });

    // History sidebar toggle
    const historySidebar   = document.getElementById('history-sidebar');
    const historyToggleBtn = document.getElementById('history-toggle-btn');
    historyToggleBtn.addEventListener('click', () => {
        historySidebar.classList.toggle('collapsed');
    });

    // Init history on load
    renderHistoryList();

    // ─── Helpers ─────────────────────────────────────────────────────────────
    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe.toString()
            .replace(/&/g,  '&amp;')
            .replace(/</g,  '&lt;')
            .replace(/>/g,  '&gt;')
            .replace(/"/g,  '&quot;')
            .replace(/'/g,  '&#039;');
    }
});
