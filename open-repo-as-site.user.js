// ==UserScript==
// @name         פתח ריפו/פריסה כאתר מהריפו (עוקף .io חסום)
// @namespace    tsoolgee
// @version      0.1.0
// @description  כפתור בדף ריפו בגיטהאב, וגם בדפי github.io עצמם, שפותח את האתר טעון במלואו מהריפו. עובד על כל משתמש וכל ריפו.
// @match        https://github.com/*/*
// @match        https://*.github.io/*
// @grant        GM_xmlhttpRequest
// @connect      raw.githack.com
// @connect      api.github.com
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    function gmRequest(url, method) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: method || 'GET',
                url: url,
                onload: function (res) { resolve(res); },
                onerror: function (err) { reject(err); },
                ontimeout: function () { reject(new Error('timeout')); }
            });
        });
    }

    async function repoExists(owner, repo) {
        try {
            const res = await gmRequest(`https://api.github.com/repos/${owner}/${repo}`);
            if (res.status >= 200 && res.status < 300) return JSON.parse(res.responseText);
        } catch (e) {}
        return null;
    }

    function buildCandidates(mode) {
        // מסלולים אפשריים לקובץ הבית של אתר סטטי
        return mode === 'pages' ? [] : ['index.html', 'docs/index.html', 'website/index.html', 'public/index.html', 'dist/index.html'];
    }

    // --- זיהוי owner/repo/subpath לפי הדומיין הנוכחי ---
    function detectTarget() {
        const host = location.hostname;

        if (host === 'github.com') {
            const parts = location.pathname.split('/').filter(Boolean);
            const RESERVED = ['settings', 'notifications', 'marketplace', 'explore', 'topics', 'trending', 'collections', 'sponsors', 'orgs', 'codespaces', 'issues', 'pulls', 'dashboard', 'new'];
            if (parts.length < 2 || RESERVED.includes(parts[0])) return null;
            return { owner: parts[0], repo: parts[1], mode: 'repo', subpath: null };
        }

        if (host.endsWith('.github.io')) {
            const owner = host.split('.')[0];
            const parts = location.pathname.split('/').filter(Boolean);
            // ניחוש ראשון: project page -> segment ראשון הוא שם הריפו
            const guessRepo = parts.length > 0 ? parts[0] : (owner + '.github.io');
            const guessSubpath = parts.length > 0 ? parts.slice(1).join('/') : '';
            return {
                owner,
                mode: 'pages',
                guessRepo,
                guessSubpath: guessSubpath || 'index.html',
                fallbackRepo: owner + '.github.io',
                fallbackSubpath: (location.pathname.replace(/^\//, '') || 'index.html')
            };
        }
        return null;
    }

    const target = detectTarget();
    if (!target) return;

    if (document.getElementById('repo-pages-bypass-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'repo-pages-bypass-btn';
    btn.textContent = target.mode === 'pages' ? '🌐 פתח מהריפו (עוקף io)' : '🌐 פתח כאתר (מהריפו)';
    btn.style.cssText = `
        position: fixed; bottom: 20px; left: 20px; z-index: 99999;
        padding: 10px 16px; background: #238636; color: #fff; border: none;
        border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
        box-shadow: 0 2px 10px rgba(0,0,0,.35); font-family: sans-serif;
    `;
    document.body.appendChild(btn);

    btn.addEventListener('click', async () => {
        const original = btn.textContent;
        btn.disabled = true;
        try {
            let owner = target.owner, repo, subpath, branch;

            if (target.mode === 'repo') {
                btn.textContent = 'בודק ריפו...';
                const info = await repoExists(owner, target.repo);
                if (!info) throw new Error('לא הצלחתי לקרוא מידע על הריפו');
                repo = target.repo;
                branch = info.default_branch || 'main';

                const candidates = buildCandidates('repo');
                let found = null;
                btn.textContent = 'מחפש index.html...';
                for (const path of candidates) {
                    const url = `https://raw.githack.com/${owner}/${repo}/${branch}/${path}`;
                    const res = await gmRequest(url, 'GET');
                    console.log('[repo-pages-bypass]', url, '->', res.status);
                    if (res.status >= 200 && res.status < 300) { found = url; break; }
                }
                if (!found) throw new Error('לא נמצא index.html בריפו (בדוק ידנית את מבנה הקבצים)');
                window.open(found, '_blank');
                return;
            }

            // mode === 'pages': ננסה קודם כ-project page, אח"כ fallback ל-user page
            btn.textContent = 'מזהה ריפו...';
            let info = await repoExists(owner, target.guessRepo);
            if (info) {
                repo = target.guessRepo;
                subpath = target.guessSubpath;
            } else {
                info = await repoExists(owner, target.fallbackRepo);
                if (!info) throw new Error('לא הצלחתי לזהות את הריפו מאחורי הכתובת הזו');
                repo = target.fallbackRepo;
                subpath = target.fallbackSubpath;
            }
            branch = info.default_branch || 'main';

            btn.textContent = 'בונה קישור...';
            let url = `https://raw.githack.com/${owner}/${repo}/${branch}/${subpath}`;
            let res = await gmRequest(url, 'GET');
            console.log('[repo-pages-bypass]', url, '->', res.status);
            if (!(res.status >= 200 && res.status < 300)) {
                // fallback ל-index.html אם הנתיב המדויק לא נמצא
                url = `https://raw.githack.com/${owner}/${repo}/${branch}/index.html`;
                res = await gmRequest(url, 'GET');
                console.log('[repo-pages-bypass fallback]', url, '->', res.status);
                if (!(res.status >= 200 && res.status < 300)) {
                    throw new Error('לא הצלחתי למצוא את הדף המתאים בריפו');
                }
            }
            window.open(url, '_blank');
        } catch (e) {
            alert('שגיאה: ' + (e && e.message ? e.message : e));
        } finally {
            btn.textContent = original;
            btn.disabled = false;
        }
    });
})();
