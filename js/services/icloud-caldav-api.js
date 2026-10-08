/**
 * iCloudカレンダー連携（公式CalDAVプロトコル）— Gateway経由
 *
 * なぜCalDAVか（OAuthのGoogleカレンダーではなくこちらにした理由）:
 *   本人から「カレンダーはできればiCloudにして」との明示指示（2026-09-05）。
 *   iCloudはOAuthアプリ登録が要らず、Apple IDと「Appサイト固有パスワード」
 *   （appleid.apple.com > サインインとセキュリティ で本人が発行する、
 *   このアプリ専用の使い捨てパスワード）だけで、Apple公式のCalDAV
 *   プロトコルにつながる。本来のApple IDパスワードは一切使わない・
 *   扱わない（このツールの「金融資格情報・パスワードを入力しない」という
 *   絶対ルールに、本来のパスワードは踏み込まないための設計）。
 *
 * 正直に書いておくこと（今の実装でできる範囲）:
 *   ・読み取り（一覧表示）と、単発の予定の作成に対応
 *   ・繰り返し予定（RRULE）は、最初の1件分のタイトル・日時だけを表示する
 *     簡易対応。繰り返しの全展開はしていない
 *   ・予定の編集・削除はまだ用意していない（次の段階）
 */
const AReGLM_ICLOUD_CAL = {
    APPLE_ID_KEY: 'areglm_icloud_apple_id',
    CALENDARS_KEY: 'areglm_icloud_calendars',

    getAppleId() {
        return localStorage.getItem(this.APPLE_ID_KEY) || '';
    },

    async getAppPassword() {
        return AReGLM_SECURITY.loadApiKeySecure('icloud_calendar', 'app_password');
    },

    async isConnected() {
        return !!this.getAppleId() && !!(await this.getAppPassword());
    },

    async disconnect() {
        localStorage.removeItem(this.APPLE_ID_KEY);
        localStorage.removeItem(this.CALENDARS_KEY);
        const store = JSON.parse(localStorage.getItem(AReGLM_SECURITY.SECRETS_KEY) || '{}');
        if (store.icloud_calendar) {
            delete store.icloud_calendar.app_password;
            localStorage.setItem(AReGLM_SECURITY.SECRETS_KEY, JSON.stringify(store));
        }
    },

    /** 見つけたカレンダー一覧（{href, name}）。中身に個人情報は含まない。 */
    getKnownCalendars() {
        try {
            return JSON.parse(localStorage.getItem(this.CALENDARS_KEY) || '[]');
        } catch {
            return [];
        }
    },

    /** CalDAVサーバーへの共通呼び出し（PROPFIND/REPORT/PUT等をそのまま中継） */
    async _call(method, path, body, extra) {
        if (!(await AReGLM_API_CLIENT.health())) {
            throw new Error('ゲートウェイが動いていないため、iCloudとつなげません。');
        }
        const appleId = this.getAppleId();
        const appPassword = await this.getAppPassword();
        if (!appleId || !appPassword) throw new Error('iCloudのApple ID・Appサイト固有パスワード未設定 → 設定（⚙）');

        const res = await fetch('/api/icloud-caldav-proxy', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Icloud-Apple-Id': appleId,
                'X-Icloud-App-Password': appPassword,
            },
            body: JSON.stringify({ method, path, body, depth: extra?.depth, contentType: extra?.contentType }),
        });
        const text = await res.text();
        if (!res.ok) {
            throw new Error(`CalDAVエラー（HTTP ${res.status}）: ${text.slice(0, 200)}`);
        }
        return text;
    },

    /** XML文字列をDOMで読めるようにする（タグ名にネームスペース接頭辞が付くのでlocal-nameで探す） */
    _parseXml(text) {
        return new DOMParser().parseFromString(text, 'application/xml');
    },

    /** ネームスペースを問わずローカル名で要素を探す */
    _byLocalName(root, name) {
        return [...root.getElementsByTagName('*')].filter((el) => el.localName === name);
    },

    /**
     * 接続確認をかねた自動検出:
     * ルート → 本人のプリンシパル → カレンダーホーム → カレンダー一覧、の順にたどる。
     * 見つけたカレンダー一覧は（機微情報を含まないので）localStorageに控えて、
     * 次回からの再検出を省ける（「再検出」ボタンで手動更新もできる）。
     */
    async discover() {
        const 探す = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:"><D:prop><D:current-user-principal/></D:prop></D:propfind>`;
        const rootXml = await this._call('PROPFIND', '/', 探す, { depth: 0 });
        const rootDoc = this._parseXml(rootXml);
        const principalHref = this._byLocalName(rootDoc, 'current-user-principal')[0]
            ?.getElementsByTagName('*')[0]?.textContent;
        if (!principalHref) throw new Error('Apple IDまたはAppサイト固有パスワードが正しくない可能性があります（本人のプリンシパルが見つかりませんでした）');

        const home探す = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
<D:prop><C:calendar-home-set/></D:prop></D:propfind>`;
        const homeXml = await this._call('PROPFIND', principalHref, home探す, { depth: 0 });
        const homeDoc = this._parseXml(homeXml);
        const homeHref = this._byLocalName(homeDoc, 'calendar-home-set')[0]
            ?.getElementsByTagName('*')[0]?.textContent;
        if (!homeHref) throw new Error('カレンダーの置き場所が見つかりませんでした');

        const cal探す = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
<D:prop><D:resourcetype/><D:displayname/><C:supported-calendar-component-set/></D:prop></D:propfind>`;
        const calXml = await this._call('PROPFIND', homeHref, cal探す, { depth: 1 });
        const calDoc = this._parseXml(calXml);
        const responses = this._byLocalName(calDoc, 'response');

        const カレンダー一覧 = [];
        responses.forEach((r) => {
            const restype = this._byLocalName(r, 'resourcetype');
            const isCalendar = restype.some((rt) => this._byLocalName(rt, 'calendar').length > 0);
            if (!isCalendar) return;
            const href = this._byLocalName(r, 'href')[0]?.textContent;
            const name = this._byLocalName(r, 'displayname')[0]?.textContent || href;
            if (href) カレンダー一覧.push({ href, name });
        });

        localStorage.setItem(this.CALENDARS_KEY, JSON.stringify(カレンダー一覧));
        return カレンダー一覧;
    },

    /**
     * 期間内の予定を取ってくる（REPORT calendar-query）。
     * @param calendarHref discover() が返した href
     * @param startISO 'YYYY-MM-DD' または ISO日時
     * @param endISO   同上
     */
    async listEvents(calendarHref, startISO, endISO) {
        const fmt = (iso) => iso.replace(/[-:]/g, '').replace(/\.\d+Z?$/, '').replace(/Z?$/, 'Z').slice(0, 16) + 'Z';
        const query = `<?xml version="1.0" encoding="utf-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
<D:prop><D:getetag/><C:calendar-data/></D:prop>
<C:filter><C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT">
<C:time-range start="${fmt(startISO)}" end="${fmt(endISO)}"/>
</C:comp-filter></C:comp-filter></C:filter>
</C:calendar-query>`;
        const xml = await this._call('REPORT', calendarHref, query, { depth: 1 });
        const doc = this._parseXml(xml);
        const 応答 = this._byLocalName(doc, 'response');

        const 予定一覧 = [];
        応答.forEach((r) => {
            const href = this._byLocalName(r, 'href')[0]?.textContent;
            const ics = this._byLocalName(r, 'calendar-data')[0]?.textContent;
            if (!ics) return;
            const ev = this._parseVEvent(ics);
            if (ev) 予定一覧.push({ ...ev, href });
        });
        return 予定一覧;
    },

    /**
     * VEVENTを最低限読む（SUMMARY・DTSTART・DTEND・UID）。
     * 繰り返し予定（RRULE）は最初の1件分のみ。全展開はしない（正直に明記）。
     */
    _parseVEvent(ics) {
        const block = ics.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/);
        if (!block) return null;
        const 一行 = (label) => {
            const m = block[0].match(new RegExp(`^${label}[^:]*:(.*)$`, 'm'));
            return m ? m[1].trim() : '';
        };
        const dtstartRaw = block[0].match(/^DTSTART[^:]*:(.*)$/m)?.[1]?.trim() || '';
        const isAllDay = /^DTSTART;VALUE=DATE:/m.test(block[0]);
        return {
            uid: 一行('UID'),
            title: 一行('SUMMARY').replace(/\\,/g, ',').replace(/\\n/gi, '\n'),
            start: dtstartRaw,
            end: block[0].match(/^DTEND[^:]*:(.*)$/m)?.[1]?.trim() || '',
            allDay: isAllDay,
            recurring: /^RRULE:/m.test(block[0]),
        };
    },

    /**
     * 単発の予定を作る（PUT）。繰り返し予定の作成はまだ未対応。
     * @param calendarHref discover() が返した href
     * @param 予定 {title, startISO, endISO, allDay}
     */
    async createEvent(calendarHref, 予定) {
        const uid = (crypto.randomUUID ? crypto.randomUUID() : ('ev-' + Date.now() + '-' + Math.random().toString(36).slice(2)));
        const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
        const fmtDate = (iso) => iso.replace(/-/g, '');
        const fmtDateTime = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

        const dtstart = 予定.allDay
            ? `DTSTART;VALUE=DATE:${fmtDate(予定.startISO)}`
            : `DTSTART:${fmtDateTime(予定.startISO)}`;
        const dtend = 予定.allDay
            ? `DTEND;VALUE=DATE:${fmtDate(予定.endISO || 予定.startISO)}`
            : `DTEND:${fmtDateTime(予定.endISO || 予定.startISO)}`;

        const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//ARELM//iCloud連携//JA
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${now}
${dtstart}
${dtend}
SUMMARY:${(予定.title || '').replace(/,/g, '\\,')}
END:VEVENT
END:VCALENDAR
`;
        const path = `${calendarHref}${uid}.ics`;
        await this._call('PUT', path, ics, { contentType: 'text/calendar; charset=utf-8' });
        return { uid, href: path };
    },
};

window.AReGLM_ICLOUD_CAL = AReGLM_ICLOUD_CAL;
