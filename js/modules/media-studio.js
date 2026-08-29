/**
 * メディアスタジオ — 動画制作・画面録画・録音・スクリーンショット
 *
 * すべてブラウザ標準機能のみで動作し、外部サービスへは一切送信しない。
 *  - 動画制作: canvas.captureStream() + MediaRecorder で実ファイル(.webm)を生成
 *  - 画面録画: getDisplayMedia()
 *  - 録音:     getUserMedia({audio:true})
 * 生成物に電子透かしは一切入らない。
 */

let mediaRecorder = null;
let mediaChunks = [];
let mediaStream = null;
let videoSlides = [];

function initMediaStudio() {
    document.getElementById('media-slide-add')?.addEventListener('change', addVideoSlide);
    document.getElementById('media-video-build')?.addEventListener('click', buildVideo);
    document.getElementById('media-slides-clear')?.addEventListener('click', clearVideoSlides);

    document.getElementById('media-screen-btn')?.addEventListener('click', () => startRecording('screen'));
    document.getElementById('media-audio-btn')?.addEventListener('click', () => startRecording('audio'));
    document.getElementById('media-stop-btn')?.addEventListener('click', stopRecording);
    document.getElementById('media-shot-btn')?.addEventListener('click', takeScreenshot);

    bindMediaRange('media-duration', 'media-duration-val', (v) => `${v}秒/枚`);
    document.getElementById('media-duration')?.addEventListener('input', updateVideoEstimate);
    renderVideoSlides();
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

/* ---------- 動画制作（画像から） ---------- */

function addVideoSlide(e) {
    const files = Array.from(e.target.files || []);
    let pending = files.length;
    if (!pending) return;

    files.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                videoSlides.push({ img, name: file.name });
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

function clearVideoSlides() {
    videoSlides = [];
    renderVideoSlides();
}

function renderVideoSlides() {
    const box = document.getElementById('media-slides');
    if (!box) return;
    if (!videoSlides.length) {
        box.innerHTML = '<p class="hint">画像を追加すると、ここに並び順が表示されます。</p>';
        updateVideoEstimate();
        return;
    }
    box.innerHTML = videoSlides
        .map(
            (s, i) => `<figure class="media-slide">
                <img src="${AReGLM_SECURITY.escapeAttr(s.img.src)}" alt="">
                <figcaption>${i + 1}. ${AReGLM_SECURITY.sanitizeHtml(s.name)}</figcaption>
            </figure>`
        )
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

/**
 * 画像を順に描画しながら canvas を録画して動画ファイルを作る。
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
    setMediaStatus('動画を書き出しています…');

    rec.start();

    for (let i = 0; i < videoSlides.length; i++) {
        await renderSlideFor(ctx, canvas, videoSlides[i].img, per, fade);
    }

    rec.stop();
    const blob = await done;

    downloadBlob(blob, `areglm_movie_${Date.now()}.webm`);
    setMediaStatus(`書き出し完了（${(blob.size / 1024 / 1024).toFixed(1)}MB）`);
    if (btn) {
        btn.disabled = false;
        btn.textContent = '動画を書き出す';
    }
    if (window.logActivity) logActivity('動画を書き出し', { category: 'media' });
}

/** 1枚のスライドを指定時間ぶん描画する（任意でフェード） */
function renderSlideFor(ctx, canvas, img, durationMs, fade) {
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

function pickVideoMime() {
    const candidates = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm'
    ];
    return candidates.find((m) => MediaRecorder.isTypeSupported(m)) || null;
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
