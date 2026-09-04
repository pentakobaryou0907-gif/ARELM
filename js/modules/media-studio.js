/**
 * メディアスタジオ — 動画制作・画面録画・録音・スクリーンショット
 *
 * すべてブラウザ標準機能のみで動作し、外部サービスへは一切送信しない。
 *  - 動画制作: canvas.captureStream() + MediaRecorder で実ファイル(.webm)を生成
 *    スライドは画像だけでなく、保管庫の動画クリップも混ぜられる
 *    （すでに書き出し済みの3Dレンダリング・ターンテーブル動画などは、
 *    ここでは「動画」として扱う。この端末に3Dを描画する機能自体は無い）。
 *    音源は保管庫の音声、またはファイルから選べる（Web Audio API で合成。
 *    ここも外部へは一切送らない）。
 *  - 画面録画: getDisplayMedia()
 *  - 録音:     getUserMedia({audio:true})
 * 生成物に電子透かしは一切入らない。
 */

let mediaRecorder = null;
let mediaChunks = [];
let mediaStream = null;
let videoSlides = [];

/** 選んだ音源（BGM）。デコード済みのAudioBufferで持つ（尺の計算・繰り返しに要る） */
let mediaAudioBuffer = null;
let mediaAudioName = '';

/** 直前に書き出して保管庫に保存できた動画（SNS投稿キューへ添付するのに使う） */
let lastBuiltVideo = null;

function initMediaStudio() {
    document.getElementById('media-slide-add')?.addEventListener('change', addVideoSlide);
    document.getElementById('media-video-build')?.addEventListener('click', buildVideo);
    document.getElementById('media-slides-clear')?.addEventListener('click', clearVideoSlides);

    document.getElementById('media-lib-refresh-btn')?.addEventListener('click', renderMediaLibraryPicker);
    document.getElementById('media-audio-file')?.addEventListener('change', handleAudioFileSelect);
    document.getElementById('media-audio-lib-refresh-btn')?.addEventListener('click', renderMediaAudioLibraryPicker);
    document.getElementById('media-audio-clear')?.addEventListener('click', clearMediaAudio);
    document.getElementById('media-video-queue-add-btn')?.addEventListener('click', addBuiltVideoToSnsQueue);

    document.getElementById('media-screen-btn')?.addEventListener('click', () => startRecording('screen'));
    document.getElementById('media-audio-btn')?.addEventListener('click', () => startRecording('audio'));
    document.getElementById('media-stop-btn')?.addEventListener('click', stopRecording);
    document.getElementById('media-shot-btn')?.addEventListener('click', takeScreenshot);

    bindMediaRange('media-duration', 'media-duration-val', (v) => `${v}秒/枚`);
    document.getElementById('media-duration')?.addEventListener('input', updateVideoEstimate);

    renderVideoSlides();
    renderMediaAudioStatus();
    renderMediaLibraryPicker();
    renderMediaAudioLibraryPicker();
    populateMediaVideoPlatformSelect();
}

function bindMediaRange(rangeId, labelId, fmt) {
    const r = document.getElementById(rangeId);
    const l = document.getElementById(labelId);
    if (!r || !l) return;
    l.textContent = fmt(r.value);
    r.addEventListener('input', () => {
        l.textContent = fmt(r.value);
    });
}

/* ---------- 動画制作（画像・保管庫の素材から） ---------- */

function addVideoSlide(e) {
    const files = Array.from(e.target.files || []);
    let pending = files.length;
    if (!pending) return;

    files.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                videoSlides.push({ kind: 'image', el: img, name: file.name });
                if (--pending === 0) renderVideoSlides();
            };
            img.onerror = () => {
                if (--pending === 0) renderVideoSlides();
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });
    e.target.value = '';
}

/**
 * 保管庫（写真・動画）から、スライドを追加する。
 *
 * 「2Dの画像」も「すでに出来上がっている動画（3Dレンダリングの
 * ターンテーブル動画なども含む）」も、ここでは同じ「スライド」として扱う。
 * この端末に3Dを描画する機能自体は無いので、3Dを謳う表現はしない
 * ——すでに用意された動画・画像を並べるだけ、というのが正直なところ。
 */
async function addLibrarySlide(id) {
    if (typeof 保管庫から取る !== 'function') return;
    const もの = await 保管庫から取る(id);
    if (!もの || !もの.中身) {
        showNotification('保管庫から取り出せませんでした', 'error');
        return;
    }

    if (もの.種類 === '画像') {
        const url = URL.createObjectURL(もの.中身);
        const img = new Image();
        await new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
            img.src = url;
        });
        videoSlides.push({ kind: 'image', el: img, name: もの.名前, libId: id });
    } else if (もの.種類 === '動画') {
        const url = URL.createObjectURL(もの.中身);
        const video = document.createElement('video');
        video.src = url;
        video.muted = true; // 元の音声は使わない。BGMは別に設定する。
        video.playsInline = true;
        await new Promise((resolve) => {
            video.onloadedmetadata = resolve;
            video.onerror = resolve;
        });
        videoSlides.push({ kind: 'video', el: video, name: もの.名前, libId: id });
    } else {
        showNotification('画像・動画だけをスライドに追加できます', 'error');
        return;
    }

    renderVideoSlides();
    showNotification(`「${もの.名前}」をスライドに追加しました`, 'success');
}

/** 保管庫の画像・動画を一覧して、スライドへの追加ボタンを並べる */
async function renderMediaLibraryPicker() {
    const box = document.getElementById('media-lib-picker');
    if (!box) return;
    if (typeof 一覧を読む !== 'function') {
        box.innerHTML = '<p class="hint">保管庫が使えません</p>';
        return;
    }

    box.innerHTML = '<p class="hint">読み込み中…</p>';
    const 一覧 = (await 一覧を読む()).filter((x) => x.種類 === '画像' || x.種類 === '動画');
    if (!一覧.length) {
        box.innerHTML = '<p class="hint">保管庫に画像・動画がありません（保管庫ページから入れられます）</p>';
        return;
    }

    box.innerHTML = '';
    一覧.forEach((x) => {
        const card = document.createElement('div');
        card.className = 'media-lib-item';

        if (x.種類 === '画像') {
            const url = URL.createObjectURL(x.中身);
            const img = document.createElement('img');
            img.src = url;
            img.alt = x.名前;
            img.loading = 'lazy';
            img.onload = () => URL.revokeObjectURL(url);
            card.appendChild(img);
        } else {
            const badge = document.createElement('div');
            badge.className = 'media-lib-item-icon';
            badge.textContent = '🎬';
            card.appendChild(badge);
        }

        const 名 = document.createElement('div');
        名.className = 'media-lib-item-name';
        名.textContent = x.名前;
        名.title = x.名前;
        card.appendChild(名);

        const 追加 = document.createElement('button');
        追加.type = 'button';
        追加.className = 'btn btn-sm btn-secondary';
        追加.textContent = '＋ スライドに追加';
        追加.addEventListener('click', () => addLibrarySlide(x.id));
        card.appendChild(追加);

        box.appendChild(card);
    });
}

function clearVideoSlides() {
    // 保管庫由来のオブジェクトURLは、使い終わったら解放しておく
    // （data: URIに対して呼んでも害はない）。
    videoSlides.forEach((s) => {
        try { URL.revokeObjectURL(s.el.src); } catch { /* 何もしない */ }
    });
    videoSlides = [];
    renderVideoSlides();
}

function renderVideoSlides() {
    const box = document.getElementById('media-slides');
    if (!box) return;
    if (!videoSlides.length) {
        box.innerHTML = '<p class="hint">画像を追加すると、ここに並び順が表示されます。保管庫の画像・動画も追加できます。</p>';
        updateVideoEstimate();
        return;
    }
    box.innerHTML = videoSlides
        .map((s, i) => {
            const 中身 = s.kind === 'video'
                ? '<div class="media-slide-video">🎬</div>'
                : `<img src="${AReGLM_SECURITY.escapeAttr(s.el.src)}" alt="">`;
            return `<figure class="media-slide">
                ${中身}
                <figcaption>${i + 1}. ${AReGLM_SECURITY.sanitizeHtml(s.name)}</figcaption>
            </figure>`;
        })
        .join('');
    updateVideoEstimate();
}

function updateVideoEstimate() {
    const el = document.getElementById('media-estimate');
    if (!el) return;
    const per = parseFloat(document.getElementById('media-duration')?.value || '3');
    const total = videoSlides.length * per;
    el.textContent = videoSlides.length
        ? `${videoSlides.length}枚 × ${per}秒 = 約${total.toFixed(0)}秒（${Math.floor(total / 60)}分${Math.round(total % 60)}秒）の動画になります`
        : '';
}

/* ---------- 音源（BGM） ---------- */

async function handleAudioFileSelect(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await 音源を読み込んで設定する(file, file.name);
}

async function setMediaAudioFromLibrary(id, name) {
    if (typeof 保管庫から取る !== 'function') return;
    const もの = await 保管庫から取る(id);
    if (!もの || !もの.中身) {
        showNotification('保管庫から取り出せませんでした', 'error');
        return;
    }
    await 音源を読み込んで設定する(もの.中身, もの.名前 || name);
}

/**
 * 音源をデコードして持っておく。
 *
 * ファイルのままではなく、AudioBuffer（デコード済み）で持つ。
 * こうしておくと、書き出すときに「動画の長さより短ければ繰り返し、
 * 長ければ打ち切る」という調整が、そのつど計算し直さずにできる。
 */
async function 音源を読み込んで設定する(blob, name) {
    setMediaStatus('音源を読み込んでいます…');
    try {
        const 配列 = await blob.arrayBuffer();
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        mediaAudioBuffer = await ctx.decodeAudioData(配列);
        ctx.close().catch(() => { /* 閉じられなくても実害はない */ });
        mediaAudioName = name;
        renderMediaAudioStatus();
        showNotification(`音源「${name}」を設定しました`, 'success');
    } catch (err) {
        mediaAudioBuffer = null;
        mediaAudioName = '';
        renderMediaAudioStatus();
        showNotification('音源を読み込めませんでした: ' + err.message, 'error');
    } finally {
        setMediaStatus('');
    }
}

function clearMediaAudio() {
    mediaAudioBuffer = null;
    mediaAudioName = '';
    renderMediaAudioStatus();
}

function renderMediaAudioStatus() {
    const el = document.getElementById('media-audio-status');
    if (!el) return;
    el.textContent = mediaAudioBuffer
        ? `🎵 音源: ${mediaAudioName}（動画の長さに合わせて、短ければ繰り返し・長ければ途中で止めます）`
        : '音源は設定されていません（このままだと無音で書き出します）';
}

/** 保管庫の音声を一覧して、選ぶボタンを並べる */
async function renderMediaAudioLibraryPicker() {
    const box = document.getElementById('media-audio-lib-picker');
    if (!box) return;
    if (typeof 一覧を読む !== 'function') {
        box.innerHTML = '<p class="hint">保管庫が使えません</p>';
        return;
    }

    box.innerHTML = '<p class="hint">読み込み中…</p>';
    const 一覧 = (await 一覧を読む()).filter((x) => x.種類 === '音声');
    if (!一覧.length) {
        box.innerHTML = '<p class="hint">保管庫に音声がありません（保管庫ページから入れられます）</p>';
        return;
    }

    box.innerHTML = '';
    一覧.forEach((x) => {
        const チップ = document.createElement('button');
        チップ.type = 'button';
        チップ.className = 'btn btn-sm btn-secondary';
        チップ.textContent = `🎵 ${x.名前}`;
        チップ.addEventListener('click', () => setMediaAudioFromLibrary(x.id, x.名前));
        box.appendChild(チップ);
    });
}

/**
 * 音声トラックを、録画中のstreamに混ぜる。
 *
 * canvas.captureStream() は映像だけしか持たない。
 * ここでデコード済みの音源から音声トラックを作り、streamに足す。
 * 録画が終わったら呼ぶための「後片付け」関数を返す。
 */
function 音声トラックを混ぜる(stream, audioBuffer, 総尺ms) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const dest = ctx.createMediaStreamDestination();
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    // 動画より短い音源は繰り返す。長い音源は動画の尺で止める。
    source.loop = audioBuffer.duration * 1000 < 総尺ms;
    source.connect(dest);
    source.start();
    source.stop(ctx.currentTime + 総尺ms / 1000);

    dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));

    return () => {
        try { source.stop(); } catch { /* すでに止まっていてもよい */ }
        ctx.close().catch(() => { /* 閉じられなくても実害はない */ });
    };
}

/**
 * 画像・動画クリップを順に描画しながら canvas を録画して動画ファイルを作る。
 * 長さの上限は設けていない（枚数×秒数のぶんだけ生成される）。
 */
async function buildVideo() {
    if (!videoSlides.length) {
        showNotification('先に画像を追加してください', 'error');
        return;
    }

    const btn = document.getElementById('media-video-build');
    const per = parseFloat(document.getElementById('media-duration')?.value || '3') * 1000;
    const size = (document.getElementById('media-video-size')?.value || '1080x1080').split('x').map(Number);
    const fade = document.getElementById('media-fade')?.checked;

    const canvas = document.createElement('canvas');
    canvas.width = size[0];
    canvas.height = size[1];
    const ctx = canvas.getContext('2d');

    const stream = canvas.captureStream(30);
    const mime = pickVideoMime();
    if (!mime) {
        showNotification('このブラウザは動画の書き出しに対応していません（Chrome推奨）', 'error');
        return;
    }

    const 総尺ms = videoSlides.length * per;
    let 音声後片付け = null;
    if (mediaAudioBuffer) {
        try {
            音声後片付け = 音声トラックを混ぜる(stream, mediaAudioBuffer, 総尺ms);
        } catch (e) {
            console.warn('音源を混ぜられませんでした:', e.message);
        }
    }

    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8000000 });
    const chunks = [];
    rec.ondataavailable = (ev) => {
        if (ev.data.size) chunks.push(ev.data);
    };

    const done = new Promise((resolve) => {
        rec.onstop = () => resolve(new Blob(chunks, { type: mime }));
    });

    if (btn) {
        btn.disabled = true;
        btn.textContent = '書き出し中…';
    }
    setMediaStatus(mediaAudioBuffer ? '動画を書き出しています…（音源あり）' : '動画を書き出しています…');

    rec.start();

    for (let i = 0; i < videoSlides.length; i++) {
        await renderSlideFor(ctx, canvas, videoSlides[i], per, fade);
    }

    rec.stop();
    const blob = await done;
    if (音声後片付け) 音声後片付け();

    downloadBlob(blob, `areglm_movie_${Date.now()}.webm`);
    setMediaStatus(`書き出し完了（${(blob.size / 1024 / 1024).toFixed(1)}MB）`);
    if (btn) {
        btn.disabled = false;
        btn.textContent = '動画を書き出す';
    }
    if (window.logActivity) {
        logActivity('動画を書き出し', {
            category: 'media', 素材数: videoSlides.length, 音源あり: !!mediaAudioBuffer,
        });
    }

    await 動画を保管庫に保存してキュー準備(blob, mime);
}

/** 1枚のスライドを指定時間ぶん描画する（画像・動画のどちらでも） */
function renderSlideFor(ctx, canvas, slide, durationMs, fade) {
    if (slide.kind === 'video') return renderVideoSlideFor(ctx, canvas, slide.el, durationMs, fade);
    return renderImageSlideFor(ctx, canvas, slide.el, durationMs, fade);
}

/** 1枚の画像を指定時間ぶん描画する（任意でフェード） */
function renderImageSlideFor(ctx, canvas, img, durationMs, fade) {
    return new Promise((resolve) => {
        const start = performance.now();
        const fadeMs = fade ? Math.min(400, durationMs / 3) : 0;

        const draw = (now) => {
            const elapsed = now - start;
            if (elapsed >= durationMs) return resolve();

            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            let alpha = 1;
            if (fadeMs) {
                if (elapsed < fadeMs) alpha = elapsed / fadeMs;
                else if (elapsed > durationMs - fadeMs) alpha = (durationMs - elapsed) / fadeMs;
            }
            ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

            // アスペクト比を保って中央に収める
            const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
            const w = img.width * scale;
            const h = img.height * scale;
            ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
            ctx.globalAlpha = 1;

            requestAnimationFrame(draw);
        };
        requestAnimationFrame(draw);
    });
}

/**
 * 1本の動画クリップを、指定時間ぶん再生しながら描画する。
 *
 * クリップ自身の音声は使わない（muted）。BGMは別に混ぜてある。
 * クリップがスライドの持ち時間より短ければ繰り返し、
 * 長ければ持ち時間で打ち切る。
 */
function renderVideoSlideFor(ctx, canvas, video, durationMs, fade) {
    return new Promise((resolve) => {
        video.currentTime = 0;
        video.loop = true;
        let 開始済み = false;
        const start = performance.now();
        const fadeMs = fade ? Math.min(400, durationMs / 3) : 0;

        const 終える = () => {
            video.pause();
            video.loop = false;
            resolve();
        };

        const draw = (now) => {
            const elapsed = now - start;
            if (elapsed >= durationMs) return 終える();

            if (!開始済み) {
                video.play().catch(() => { /* 自動再生できなくても、描画は続ける */ });
                開始済み = true;
            }

            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            let alpha = 1;
            if (fadeMs) {
                if (elapsed < fadeMs) alpha = elapsed / fadeMs;
                else if (elapsed > durationMs - fadeMs) alpha = (durationMs - elapsed) / fadeMs;
            }
            ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

            const vw = video.videoWidth || canvas.width;
            const vh = video.videoHeight || canvas.height;
            const scale = Math.min(canvas.width / vw, canvas.height / vh);
            const w = vw * scale;
            const h = vh * scale;
            ctx.drawImage(video, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
            ctx.globalAlpha = 1;

            requestAnimationFrame(draw);
        };
        requestAnimationFrame(draw);
    });
}

function pickVideoMime() {
    const candidates = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm'
    ];
    return candidates.find((m) => MediaRecorder.isTypeSupported(m)) || null;
}

/**
 * 書き出した動画を保管庫にも保存し、
 * 「このままSNS投稿キューに追加する」ミニフォームを出す。
 *
 * 保管庫に保存できれば、あとで探し直さなくて済むように
 * 投稿キューの項目からIDで指し示せるようにする。
 * 保存できなくても、キャプションだけでキューに追加できるようにしておく
 * （動画はダウンロード済みのファイルを本人が手で使えばよい）。
 */
async function 動画を保管庫に保存してキュー準備(blob, mime) {
    const form = document.getElementById('media-video-queue-form');
    lastBuiltVideo = null;

    let 保存できた = false;
    let 保存の訳 = '';

    if (typeof 保管庫にしまう === 'function') {
        const 名 = `areglm_movie_${Date.now()}.webm`;
        const 覚え書き = `メディアスタジオで作成（素材${videoSlides.length}点${mediaAudioBuffer ? '・音源あり' : ''}）`;
        const file = new File([blob], 名, { type: mime });
        const r = await 保管庫にしまう(file, 覚え書き);
        保存できた = !!r.ok;
        保存の訳 = r.訳;
        if (r.ok) {
            lastBuiltVideo = { id: r.id, name: 名 };
            if (typeof renderLibrary === 'function') renderLibrary();
            renderMediaLibraryPicker();
        }
    }

    if (!form) return;
    form.hidden = false;
    populateMediaVideoPlatformSelect();

    const 注記 = document.getElementById('media-video-queue-note');
    if (注記) {
        注記.textContent = 保存できた
            ? '動画を保管庫に保存しました。このままSNS投稿キューに追加できます。'
            : `保管庫には保存できませんでした（${保存の訳 || '不明なエラー'}）。`
                + 'ダウンロードしたファイルを手動で使ってください。動画なしでキャプションだけキューに追加することもできます。';
    }
}

function populateMediaVideoPlatformSelect() {
    const sel = document.getElementById('media-video-platform');
    if (!sel || !window.AREGLM_PROFILE) return;
    sel.innerHTML = Object.entries(AREGLM_PROFILE.sns)
        .map(([id, s]) => `<option value="${id}">${AReGLM_SECURITY.escapeAttr(s.name)}</option>`)
        .join('');
}

/**
 * 直前に作った動画（保管庫に保存できていれば、そのID）を、
 * キャプションと一緒にSNS投稿キューへ追加する。
 *
 * 既存の handleSnsPost（sns.js）と同じ形でキューに積むので、
 * 「投稿キュー」の一覧・「出先から投稿する」にそのまま乗る。
 */
function addBuiltVideoToSnsQueue() {
    const platformSel = document.getElementById('media-video-platform');
    const captionBox = document.getElementById('media-video-caption');
    const platform = platformSel?.value;
    const caption = captionBox?.value?.trim();

    if (!platform || !caption) {
        showNotification('プラットフォームとキャプションを入力してください', 'error');
        return;
    }

    const policy = AReGLM_CONTENT_POLICY.validate(caption);
    if (!policy.ok) {
        showNotification(policy.message, 'error');
        return;
    }

    const queue = JSON.parse(localStorage.getItem('areglm_sns_queue') || '[]');
    queue.push({
        id: 'sns_' + Date.now(),
        platform,
        caption,
        profileUrl: AREGLM_PROFILE.sns[platform]?.url,
        status: 'pending',
        createdAt: new Date().toISOString(),
        動画保管庫id: lastBuiltVideo?.id || null,
        動画名: lastBuiltVideo?.name || null,
    });
    localStorage.setItem('areglm_sns_queue', JSON.stringify(queue));

    if (captionBox) captionBox.value = '';
    if (typeof loadSnsData === 'function') loadSnsData();
    showNotification(
        lastBuiltVideo ? 'SNS投稿キューに追加しました（動画つき）' : 'SNS投稿キューに追加しました',
        'success'
    );
    if (window.logActivity) {
        logActivity(`${AREGLM_PROFILE.sns[platform]?.name || platform} 向けの投稿をキューへ追加`, { category: 'sns' });
    }
}

/* ---------- 画面録画・録音 ---------- */

async function startRecording(kind) {
    if (mediaRecorder) {
        showNotification('すでに録画・録音中です', 'info');
        return;
    }

    try {
        if (kind === 'screen') {
            mediaStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        } else {
            mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
    } catch (err) {
        showNotification('開始できませんでした: ' + err.message, 'error');
        return;
    }

    const mime = kind === 'screen' ? pickVideoMime() : pickAudioMime();
    if (!mime) {
        showNotification('このブラウザは録画・録音の書き出しに対応していません', 'error');
        stopTracks();
        return;
    }

    mediaChunks = [];
    mediaRecorder = new MediaRecorder(mediaStream, { mimeType: mime });
    mediaRecorder.ondataavailable = (ev) => {
        if (ev.data.size) mediaChunks.push(ev.data);
    };
    mediaRecorder.onstop = () => {
        const blob = new Blob(mediaChunks, { type: mime });
        const ext = kind === 'screen' ? 'webm' : mime.includes('ogg') ? 'ogg' : 'webm';
        downloadBlob(blob, `areglm_${kind}_${Date.now()}.${ext}`);
        setMediaStatus(`${kind === 'screen' ? '画面録画' : '録音'}を保存しました（${(blob.size / 1024 / 1024).toFixed(1)}MB）`);
        stopTracks();
        mediaRecorder = null;
        toggleRecordingUi(false);
        if (window.logActivity) logActivity(kind === 'screen' ? '画面を録画' : '音声を録音', { category: 'media' });
    };

    // ユーザーが共有停止ボタンを押した場合にも確実に止める
    mediaStream.getTracks().forEach((t) => {
        t.addEventListener('ended', () => {
            if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
        });
    });

    mediaRecorder.start();
    toggleRecordingUi(true);
    setMediaStatus(kind === 'screen' ? '画面を録画中…' : '録音中…');
}

function pickAudioMime() {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
    return candidates.find((m) => MediaRecorder.isTypeSupported(m)) || null;
}

function stopRecording() {
    if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
}

function stopTracks() {
    mediaStream?.getTracks().forEach((t) => t.stop());
    mediaStream = null;
}

function toggleRecordingUi(recording) {
    const stopBtn = document.getElementById('media-stop-btn');
    if (stopBtn) stopBtn.disabled = !recording;
    ['media-screen-btn', 'media-audio-btn'].forEach((id) => {
        const b = document.getElementById(id);
        if (b) b.disabled = recording;
    });
}

/* ---------- スクリーンショット ---------- */

async function takeScreenshot() {
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const track = stream.getVideoTracks()[0];

        // 1フレーム描画してから取り込む
        const video = document.createElement('video');
        video.srcObject = stream;
        await video.play();
        await new Promise((r) => setTimeout(r, 300));

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);

        track.stop();
        video.srcObject = null;

        canvas.toBlob((blob) => {
            if (blob) {
                downloadBlob(blob, `areglm_screenshot_${Date.now()}.png`);
                setMediaStatus('スクリーンショットを保存しました');
                if (window.logActivity) logActivity('スクリーンショットを保存', { category: 'media' });
            }
        }, 'image/png');
    } catch (err) {
        showNotification('取得できませんでした: ' + err.message, 'error');
    }
}

/* ---------- 共通 ---------- */

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setMediaStatus(msg) {
    const el = document.getElementById('media-status');
    if (el) el.textContent = msg;
}

window.initMediaStudio = initMediaStudio;
window.updateVideoEstimate = updateVideoEstimate;
