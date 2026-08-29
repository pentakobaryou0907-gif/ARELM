import AVFoundation
import Foundation

/*
 常駐の待ち受け ― アプリを開いていなくても、呼びかけに反応する

 なぜこれを作るのか:
   これまでの待ち受けは、ブラウザの画面が開いている間だけ動いた。
   閉じてしまえば、何を言っても反応しない。
   それでは「話しかけたら応じる」道具にならない。

 前の見立ての訂正（Speech フレームワークについて）:
   以前ここには「無署名では動かない。有料の開発者証明書が要る」と
   書いていたが、<b>確かめずに書いた間違い</b>だった。

   実際に試すと、ちゃんと動いた。
   ただし条件があった：
     ・裸の実行ファイルを直に呼ぶと、Info.plist が読まれず落ちる
     ・.app の形にして開けば（署名は無料の ad-hoc で十分）、
       利用目的の説明が読まれ、端末内だけの文字起こしができる

   このファイル自身を .app にする必要はない。
   マイクの許可は、いまのやり方（裸の実行ファイル）のままで通る。
   聞き取りだけ、隣に置いた「聞き取り.app」に音を渡し、
   文字にしてもらってから受け取る形にした。
   （音はその場限りの一時ファイルで渡し、渡したあとに消す）

 何をするのか:
   1. マイクの音を、直近2秒だけ持ち回る（それ以前は捨てる）
   2. 0.4秒ごとに、その中に呼び名が居ないかを探す
   3. 呼ばれたら、続けて4秒だけ用件を聞く
   4. 用件を「聞き取り.app」に渡し、端末内で文字にしてもらう
      （教えていない言い方でも、これなら拾える）
   5. うまく文字にならなければ、このツール自作の聞き取り
      （MFCC + DTW、教えた呼び名との近さ比べ）に切り替える
   6. この端末の中のAIに渡し、返ってきた答えを声で返す

   アプリの画面は開かない。
   デスクトップを見ているときに話しかけて、
   そのまま声だけで済ませられるようにするため。

 はっきりさせておくこと:
   ・音は端末の中だけを流れる。どこへも送らない。
     文字起こしも requiresOnDeviceRecognition を使い、
     Apple のサーバーへは送らない。
   ・録音は残さない。用件を渡す一時ファイルも、使ったら消す。
   ・「聞き取り.app」が無い・失敗したときは、
     いままで通り教えた呼び名だけを聞き分ける。
*/

// ------------------------------------------------------------------
// 音の特徴（MFCC）― 画面側と同じ作り
// ------------------------------------------------------------------

let フレーム長 = 512
let フレーム間隔 = 256
let 帯数 = 26
let 係数の数 = 13

/// 高速フーリエ変換（その場で書き換える）
func fft(_ 実部: inout [Double], _ 虚部: inout [Double]) {
    let n = 実部.count
    guard n > 1 else { return }

    // 並び替え
    var j = 0
    for i in 0..<(n - 1) {
        if i < j {
            実部.swapAt(i, j)
            虚部.swapAt(i, j)
        }
        var k = n >> 1
        while k <= j {
            j -= k
            k >>= 1
        }
        j += k
    }

    var 段 = 2
    while 段 <= n {
        let 角 = -2.0 * Double.pi / Double(段)
        let wr = cos(角)
        let wi = sin(角)
        var i = 0
        while i < n {
            var cr = 1.0
            var ci = 0.0
            for k in 0..<(段 / 2) {
                let i1 = i + k
                let i2 = i1 + 段 / 2
                let tr = 実部[i2] * cr - 虚部[i2] * ci
                let ti = 実部[i2] * ci + 虚部[i2] * cr
                実部[i2] = 実部[i1] - tr
                虚部[i2] = 虚部[i1] - ti
                実部[i1] += tr
                虚部[i1] += ti
                let nr = cr * wr - ci * wi
                ci = cr * wi + ci * wr
                cr = nr
            }
            i += 段
        }
        段 <<= 1
    }
}

func メルに直す(_ hz: Double) -> Double { 2595.0 * log10(1.0 + hz / 700.0) }
func メルから戻す(_ mel: Double) -> Double { 700.0 * (pow(10.0, mel / 2595.0) - 1.0) }

/// メルの帯を作る
func メル帯を作る(_ 周波数: Double) -> [[Double]] {
    let 山の数 = 帯数 + 2
    let 下 = メルに直す(0)
    let 上 = メルに直す(周波数 / 2)
    var 点: [Int] = []
    for i in 0..<山の数 {
        let m = 下 + (上 - 下) * Double(i) / Double(山の数 - 1)
        let hz = メルから戻す(m)
        点.append(Int((Double(フレーム長) + 1) * hz / 周波数))
    }

    var 帯たち: [[Double]] = []
    for i in 1...帯数 {
        var 帯 = [Double](repeating: 0, count: フレーム長 / 2 + 1)
        let 左 = 点[i - 1], 中 = 点[i], 右 = 点[i + 1]
        if 中 > 左 {
            for k in 左..<中 where k < 帯.count {
                帯[k] = Double(k - 左) / Double(中 - 左)
            }
        }
        if 右 > 中 {
            for k in 中..<右 where k < 帯.count {
                帯[k] = Double(右 - k) / Double(右 - 中)
            }
        }
        帯たち.append(帯)
    }
    return 帯たち
}

/// 波形を、音の特徴の並びに直す
func MFCCにする(_ 波形: [Float], _ 周波数: Double, _ 帯たち: [[Double]]) -> [[Double]] {
    guard 波形.count >= フレーム長 else { return [] }
    var 出: [[Double]] = []

    var 位置 = 0
    while 位置 + フレーム長 <= 波形.count {
        var 実部 = [Double](repeating: 0, count: フレーム長)
        var 虚部 = [Double](repeating: 0, count: フレーム長)

        // ハミング窓。端を落とさないと、切れ目が雑音になる。
        for i in 0..<フレーム長 {
            let 窓 = 0.54 - 0.46 * cos(2.0 * Double.pi * Double(i) / Double(フレーム長 - 1))
            実部[i] = Double(波形[位置 + i]) * 窓
        }

        fft(&実部, &虚部)

        var 力 = [Double](repeating: 0, count: フレーム長 / 2 + 1)
        for i in 0...(フレーム長 / 2) {
            力[i] = (実部[i] * 実部[i] + 虚部[i] * 虚部[i]) / Double(フレーム長)
        }

        var 帯の力 = [Double](repeating: 0, count: 帯数)
        for b in 0..<帯数 {
            var 和 = 0.0
            for k in 0..<力.count { 和 += 力[k] * 帯たち[b][k] }
            帯の力[b] = log(和 + 1e-10)
        }

        // 離散コサイン変換。低い方だけ採る。
        var 係数 = [Double](repeating: 0, count: 係数の数)
        for i in 0..<係数の数 {
            var 和 = 0.0
            for b in 0..<帯数 {
                和 += 帯の力[b] * cos(Double.pi * Double(i) * (Double(b) + 0.5) / Double(帯数))
            }
            係数[i] = 和
        }
        出.append(係数)
        位置 += フレーム間隔
    }
    return 平均を差し引く(出)
}

/**
 * 声の癖を差し引く
 *
 * なぜこれが要るのか:
 *
 *   同じ「アレラム」でも、朝の声と夜の声、
 *   近くで言うときと離れて言うとき、
 *   マイクの前と横——数字はまるで違うものになる。
 *
 *   だが<b>違いの多くは、その場ずっと一定にかかっている</b>。
 *   声の低さ、マイクの癖、部屋の響き。
 *   これらは全部のフレームに同じだけ乗っている。
 *
 *   だから、全体の平均を引く。
 *   一定にかかっている分が消えて、
 *   <b>言葉そのものの形だけが残る</b>。
 *
 *   音声認識では昔から使われている手で、
 *   これだけで、声の調子の違いにかなり強くなる。
 *
 *   覚えた側にも、聞いた側にも、同じように掛ける。
 *   片方だけに掛けると、かえって合わなくなる。
 */
func 平均を差し引く(_ 特徴: [[Double]]) -> [[Double]] {
    guard !特徴.isEmpty else { return 特徴 }
    let 数 = 特徴[0].count
    guard 数 > 0 else { return 特徴 }

    var 平均 = [Double](repeating: 0, count: 数)
    for 行 in 特徴 {
        for k in 0..<min(数, 行.count) { 平均[k] += 行[k] }
    }
    for k in 0..<数 { 平均[k] /= Double(特徴.count) }

    return 特徴.map { 行 in
        var 出 = 行
        for k in 0..<min(数, 行.count) { 出[k] -= 平均[k] }
        return 出
    }
}

/// 話す速さの違いを吸収して比べる
func 中から探す(_ 長い: [[Double]], _ 型たね: [[Double]]) -> Double {
    let n = 長い.count
    guard n > 0, 型たね.count > 0 else { return Double.infinity }

    // 覚えた声が、聞いている窓より長いことがある。
    //
    // そのときは弾いていた。だが弾くと、
    // <b>永久に一致しない</b>ことになる。
    //
    // 長すぎるなら、真ん中を切り出して使う。
    // 呼び名は前後に息や間が入りやすく、
    // 言葉そのものは真ん中にあることが多い。
    var 型 = 型たね
    if 型.count > n {
        let 始 = (型.count - n) / 2
        型 = Array(型[始..<(始 + n)])
    }

    let m = 型.count
    guard m > 0, m <= n else { return Double.infinity }

    var 前 = [Double](repeating: Double.infinity, count: m + 1)
    var 今 = [Double](repeating: Double.infinity, count: m + 1)
    var 前の始まり = [Int](repeating: 0, count: m + 1)
    var 今の始まり = [Int](repeating: 0, count: m + 1)
    前[0] = 0

    var 最小 = Double.infinity

    for i in 1...n {
        今[0] = 0
        今の始まり[0] = i - 1
        for j in 1...m {
            var c = 0.0
            for k in 0..<係数の数 {
                let d = 長い[i - 1][k] - 型[j - 1][k]
                c += d * d
            }
            c = sqrt(c)

            var 最安 = 前[j - 1]
            var 元 = 前の始まり[j - 1]
            if 前[j] < 最安 { 最安 = 前[j]; 元 = 前の始まり[j] }
            if 今[j - 1] < 最安 { 最安 = 今[j - 1]; 元 = 今の始まり[j - 1] }

            今[j] = c + 最安
            今の始まり[j] = 元
        }
        let 始 = 今の始まり[m]
        let 長さ = max(1, i - 始)
        最小 = min(最小, 今[m] / Double(長さ + m))

        swap(&前, &今)
        swap(&前の始まり, &今の始まり)
    }
    return 最小
}

// ------------------------------------------------------------------
// 覚えた呼び名を読む
// ------------------------------------------------------------------

struct 覚えた声: Codable {
    let 言葉: String
    let 特徴: [[Double]]
}

func 覚えた声を全部読む(_ 道: String) -> [覚えた声] {
    guard let d = FileManager.default.contents(atPath: 道),
          let 一覧 = try? JSONDecoder().decode([覚えた声].self, from: d) else {
        return []
    }
    return 一覧
}

/// 声で返す。macOS に元から入っている読み上げを使う。
/// 外へは出ない。
func 声で返す(_ 文: String) {
    let 短く = String(文.prefix(140))
        .replacingOccurrences(of: "\n", with: "。")
    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/usr/bin/say")
    p.arguments = ["-v", "Kyoko", 短く]
    try? p.run()
    p.waitUntilExit()
}

/// 用件の音を、聞き取りアプリへ渡せる形（AIFF）でファイルに書く。
/// これは一時ファイルで、渡し終えたら消す。
func AIFFに書く(_ 音: [Float], 周波数: Double, 道: String) -> Bool {
    guard let 形 = AVAudioFormat(
        commonFormat: .pcmFormatFloat32, sampleRate: 周波数, channels: 1, interleaved: false
    ) else { return false }

    guard let バッファ = AVAudioPCMBuffer(pcmFormat: 形, frameCapacity: AVAudioFrameCount(音.count))
    else { return false }
    バッファ.frameLength = AVAudioFrameCount(音.count)
    音.withUnsafeBufferPointer { ptr in
        guard let 先頭 = ptr.baseAddress else { return }
        バッファ.floatChannelData![0].update(from: 先頭, count: 音.count)
    }

    guard let ファイル = try? AVAudioFile(
        forWriting: URL(fileURLWithPath: 道),
        settings: [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVSampleRateKey: 周波数,
            AVNumberOfChannelsKey: 1,
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsBigEndianKey: true,
            AVLinearPCMIsFloatKey: false,
        ],
        commonFormat: .pcmFormatFloat32,
        interleaved: false
    ) else { return false }

    do {
        try ファイル.write(from: バッファ)
        return true
    } catch {
        return false
    }
}

/// 自分（このファイル）の隣にある「聞き取り.app」に音を渡し、
/// 端末内だけの文字起こしをしてもらう。
///
/// アプリの形でないと利用目的の説明が読まれず落ちるので、
/// `open -W` で LaunchServices 経由で開き、終わるまで待つ。
/// 結果は、音ファイルの隣に書かれる .txt から受け取る。
func 自由に聞き取る(_ 音の道: String) -> String? {
    let 自分の場所 = URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent()
    let アプリ = 自分の場所.appendingPathComponent("聞き取り.app").path
    guard FileManager.default.fileExists(atPath: アプリ) else { return nil }

    let 結果の道 = 音の道 + ".txt"
    try? FileManager.default.removeItem(atPath: 結果の道)

    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/usr/bin/open")
    p.arguments = ["-W", アプリ, "--args", 音の道]
    do {
        try p.run()
    } catch {
        return nil
    }
    p.waitUntilExit()

    guard let 文字 = try? String(contentsOfFile: 結果の道, encoding: .utf8) else { return nil }
    let 整えた = 文字.trimmingCharacters(in: .whitespacesAndNewlines)
    try? FileManager.default.removeItem(atPath: 結果の道)
    return 整えた.isEmpty ? nil : 整えた
}

/// 聞き取った文に、呼び名が含まれているか。
///
/// ひらがな／カタカナの揺れ（「アレラム」「あれらむ」）を
/// 同じものとして見るため、比べる前にカタカナへそろえる。
func 呼び名として聞こえたか(_ 聞こえた文: String, _ 呼び名: String) -> Bool {
    func 揃える(_ s: String) -> String {
        (s.applyingTransform(.hiraganaToKatakana, reverse: false) ?? s)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
    let a = 揃える(聞こえた文)
    let b = 揃える(呼び名)
    guard !b.isEmpty else { return false }
    return a.contains(b)
}

/// この端末の中のAIに聞く。127.0.0.1 のみ。外へは出さない。
func 端末の中のAIに聞く(_ 言葉: String) -> String? {
    guard let url = URL(string: "http://127.0.0.1:8765/chat") else { return nil }
    var 要求 = URLRequest(url: url)
    要求.httpMethod = "POST"
    要求.setValue("application/json", forHTTPHeaderField: "Content-Type")
    要求.timeoutInterval = 12
    let 中身: [String: Any] = ["text": 言葉, "session_id": "常駐の待ち受け"]
    要求.httpBody = try? JSONSerialization.data(withJSONObject: 中身)

    var 答え: String?
    let 待ち = DispatchSemaphore(value: 0)
    URLSession.shared.dataTask(with: 要求) { d, _, _ in
        if let d = d,
           let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
           let a = j["answer"] as? String {
            答え = a
        }
        待ち.signal()
    }.resume()
    _ = 待ち.wait(timeout: .now() + 15)
    return 答え
}

// ------------------------------------------------------------------
// 言葉を覚える
//
// なぜここに入れるのか:
//   覚えるのにマイクが要る。
//   画面（ブラウザ）で覚えようとすると、
//   ブラウザにマイクの許可を出すことになる。
//
//   それは避けたい、という話だった。
//   人と話しているときに勝手に反応されたくない、というのが理由。
//
//   ここで覚えられるようにすれば、
//   ブラウザには一度もマイクを許さずに済む。
//   許可を出す先は、この待ち受けだけになる。
// ------------------------------------------------------------------

func 言葉を覚える(_ 道: String, _ 言葉: String, _ 秒: Double) {
    let engine = AVAudioEngine()
    let 入力 = engine.inputNode

    // 録るほうも、待ち受けと同じ間違いをしていた。
    // outputFormat では形が合わず、その場で落ちる。
    let 形 = 入力.inputFormat(forBus: 0)
    let 周波数 = 形.sampleRate
    let 帯たち = メル帯を作る(周波数)

    var 集めた: [Float] = []
    let 錠 = NSLock()

    入力.installTap(onBus: 0, bufferSize: 4096, format: nil) { buf, _ in
        guard let p = buf.floatChannelData?[0] else { return }
        錠.lock()
        for i in 0..<Int(buf.frameLength) { 集めた.append(p[i]) }
        錠.unlock()
    }

    do {
        try engine.start()
    } catch {
        print("マイクを使えませんでした: \(error.localizedDescription)")
        exit(1)
    }

    print("いまから\(Int(秒))秒、聞きます。「\(言葉)」と言ってください。")
    声で返す("どうぞ")
    Thread.sleep(forTimeInterval: 秒)
    engine.stop()
    入力.removeTap(onBus: 0)

    錠.lock()
    let 波形 = 集めた
    錠.unlock()

    // 前後の静かなところを落とす。
    // 話し始めるまでの間を含めたまま覚えると、
    // 毎回その間まで一致を求めることになり、通らなくなる。
    var 始 = 0
    var 終 = 波形.count - 1
    let 目安: Float = 0.02
    while 始 < 終 && abs(波形[始]) < 目安 { 始 += 1 }
    while 終 > 始 && abs(波形[終]) < 目安 { 終 -= 1 }
    let 切った = Array(波形[max(0, 始 - 800)...min(波形.count - 1, 終 + 800)])

    if 切った.count < 1600 {
        print("声が入っていませんでした。もう一度お願いします。")
        声で返す("声が聞こえませんでした")
        exit(1)
    }

    let 特徴 = MFCCにする(切った, 周波数, 帯たち)
    if 特徴.count < 4 {
        print("短すぎます。")
        声で返す("短すぎます")
        exit(1)
    }

    // すでにあるものに足す
    var 全部 = 覚えた声を全部読む(道)
    全部.append(覚えた声(言葉: 言葉, 特徴: 特徴))

    // 同じ言葉は5つまで。増やしすぎると比べる回数だけ増える。
    var 数え: [String: Int] = [:]
    var 残す: [覚えた声] = []
    for x in 全部.reversed() {
        let n = (数え[x.言葉] ?? 0) + 1
        数え[x.言葉] = n
        if n <= 5 { 残す.append(x) }
    }
    残す.reverse()

    let 出 = 残す.map { ["言葉": $0.言葉, "特徴": $0.特徴] as [String: Any] }
    if let d = try? JSONSerialization.data(withJSONObject: 出) {
        let 場所 = (道 as NSString).deletingLastPathComponent
        try? FileManager.default.createDirectory(
            atPath: 場所, withIntermediateDirectories: true)
        try? d.write(to: URL(fileURLWithPath: 道))
        let 回数 = 残す.filter { $0.言葉 == 言葉 }.count
        print("「\(言葉)」を覚えました（\(回数)回目）")
        声で返す("覚えました")
    } else {
        print("書き出せませんでした")
        exit(1)
    }
}

// ------------------------------------------------------------------
// 本体
// ------------------------------------------------------------------

let 引数 = CommandLine.arguments
let 型の道 = 引数.count > 1 ? 引数[1] : NSString(string: "~/Library/Application Support/AReGLM/覚えた声.json").expandingTildeInPath

// 「覚える」ときは、待ち受けずにそれだけして終わる
if 引数.count > 2 && 引数[2] == "--teach" {
    let 言葉 = 引数.count > 3 ? 引数[3] : "アレラム"
    let 秒 = 引数.count > 4 ? (Double(引数[4]) ?? 2.5) : 2.5
    言葉を覚える(型の道, 言葉, 秒)
    exit(0)
}
let 呼び名 = 引数.count > 2 ? 引数[2] : "アレラム"
let アプリ = 引数.count > 3 ? 引数[3] : "/Users/ari/Applications/AReGLM.app"

/// 呼び名として認めるずれの上限。
///
/// 小さいほど厳しい＝誤って反応しにくいが、呼んでも通りにくくなる。
/// 人と話している最中の誤反応を避けたいので、厳しめにしてある。
// 呼び名と認める上限。
//
// 平均を差し引くようにしたので、
// 声の大きさや調子の違いで大きくずれることが減った。
// そのぶん、上限を上げても誤って反応しにくい。
//
// 22 では「呼んでも反応しない」が続いた。
// 呼びかけに応じないほうが、道具としては困る。
// 呼び名と認める上限。
//
// 無音を取り除いたので、ずれの意味が変わった。
// 前は無音同士がよく合ってしまい、
// 緩めるほど誤って反応していた。
//
// 声の部分だけを比べるようになったので、
// ここは引き締める。
// 「呼んでいないのに動く」は会話を邪魔するので、
// 迷ったら厳しい側に倒す。
let 呼び名と認める上限 = 26.0

/// 呼びかけの前が「静か」とみなす音の大きさ。
/// これを超えていたら、会話が続いている最中とみなして応じない。
let 静かとみなす上限 = 0.015

/**
 * 通った声を、覚えに足す
 *
 * 「使いながら覚える」の中身。
 *
 * わざわざ録らせない。
 * 呼びかけが通るたび、その声が材料として貯まる。
 * 使うほど、いろいろな言い方に届くようになる。
 *
 * 上限を決めてある。無制限に増えると、
 * 一回ごとの照らし合わせが重くなり、応じるのが遅くなる。
 */
func 覚え足す(_ 道: String, _ 言葉: String, _ 特徴: [[Double]]) {
    // 覚えておく言い方の数。
    //
    // 多すぎると、一回ごとに比べる回数が増えて応じるのが遅くなる。
    // それに、似たものばかり増えても幅は広がらない。
    let 上限 = 6

    guard let もと = try? Data(contentsOf: URL(fileURLWithPath: 道)),
          var 中身 = (try? JSONSerialization.jsonObject(with: もと)) as? [[String: Any]]
    else { return }

    // すでに十分たまっていたら、いちばん古いものと入れ替える。
    // 新しい言い方のほうが、いまの声に近い。
    let 同じ = 中身.filter { ($0["言葉"] as? String) == 言葉 }
    if 同じ.count >= 上限 {
        if let 消す = 中身.firstIndex(where: {
            ($0["言葉"] as? String) == 言葉 && ($0["使いながら"] as? Bool) == true
        }) {
            中身.remove(at: 消す)
        } else {
            return   // 手で覚えさせたものは消さない
        }
    }

    // 小数は丸めて縮める。細かい桁は聞き分けに効かない。
    let 縮めた = 特徴.map { 行 in 行.map { (($0 * 100).rounded()) / 100 } }

    中身.append([
        "id": "v_\(Int(Date().timeIntervalSince1970))_\(Int.random(in: 1000...9999))",
        "言葉": 言葉,
        "特徴": 縮めた,
        "覚えた日": ISO8601DateFormatter().string(from: Date()),
        "使いながら": true,
    ])

    if let 書く = try? JSONSerialization.data(withJSONObject: 中身) {
        try? 書く.write(to: URL(fileURLWithPath: 道))
        print("　この言い方も覚えました（全\(中身.filter { ($0["言葉"] as? String) == 言葉 }.count)通り）")
    }
}

let 覚えた全部 = 覚えた声を全部読む(型の道)
// 書いたものを溜めずに、すぐ出す。
//
// 溜めたままだと、常駐させたときに記録が何も見えない。
// 「動いていないのか、記録が出ていないだけなのか」が
// 分からなくなり、調べようがなくなる。
setvbuf(stdout, nil, _IOLBF, 0)

// 覚えた型にも、同じように平均を差し引く。
//
// 覚えたときの数字には、そのときの声の癖が乗っている。
// 聞いた側だけ差し引くと、かえって合わなくなる。
// 両方から同じように抜いて、はじめて釣り合う。
/**
 * 覚えた声から、声の部分だけを切り出す
 *
 * ここが抜けていた。
 *
 * 覚えた声を調べたら、<b>74〜90%が無音</b>だった。
 * 録音の前後に、話し始める前と話し終わった後が
 * そのまま入っていたため。
 *
 * これが二つの症状を同時に起こしていた:
 *
 *   ・<b>聞き取れない</b>
 *     覚えた側はほとんど無音。
 *     実際の声とは、当然ながら合わない。
 *
 *   ・<b>何もしていないのに反応する</b>
 *     覚えた側が無音なので、
 *     部屋が静かなときに「よく似ている」と判断してしまう。
 *
 * 声の部分だけを残せば、両方とも直る。
 */
func 声の部分だけにする(_ 特徴: [[Double]]) -> [[Double]] {
    guard 特徴.count > 12 else { return 特徴 }

    let 強さ = 特徴.map { $0.isEmpty ? 0.0 : $0[0] }

    // 呼び名は、せいぜい1.5秒。
    // それより長い部分は、前置きか後始末か、部屋の音。
    // 「ねぇアレラム」が丸ごと入る長さにする。
    //
    // 120（約1.3秒）だと「アレラム」までしか入らず、
    // 「ねぇ」の部分が切り落とされていた。
    // 切り落とすと、長い言い方にした意味が無くなる。
    let 呼び名の長さ = min(特徴.count, 170)   // 約1.8秒（256点きざみ・48kHz）

    // <b>いちばん声が強く続いているところ</b>を探す。
    //
    // はじめ「前後の静かなところを削る」形にしていたが、
    // 声が最後まで続いている録音では一つも削れなかった。
    //
    // 削るのではなく、<b>いちばん濃いところを取る</b>。
    // 呼び名はひとかたまりで言うので、
    // 強さが集まっているところが、その言葉そのもの。
    var 最良の始 = 0
    var 最良の強さ = -Double.infinity

    // 走らせながら合計する。全部を数え直すと遅い。
    var 合計 = 0.0
    for i in 0..<呼び名の長さ { 合計 += 強さ[i] }
    最良の強さ = 合計
    最良の始 = 0

    for i in 呼び名の長さ..<強さ.count {
        合計 += 強さ[i] - 強さ[i - 呼び名の長さ]
        if 合計 > 最良の強さ {
            最良の強さ = 合計
            最良の始 = i - 呼び名の長さ + 1
        }
    }

    let 終わり = min(強さ.count - 1, 最良の始 + 呼び名の長さ - 1)
    guard 終わり > 最良の始, 終わり - 最良の始 >= 8 else { return 特徴 }

    return Array(特徴[最良の始...終わり])
}

// 覚えた声は、声の部分だけを取り出してから使う。
// 無音まで比べていたので、静かなときに反応していた。
/**
 * 呼びかけの言い方かどうか
 *
 * 「アレラム」だけでなく「ねぇアレラム」も呼びかけ。
 *
 * <b>長い言い方のほうが、確かです。</b>
 *
 * 「アレラム」だけだと、ふつうの会話の中の音とも似てしまう。
 * 「ねぇアレラム」なら、その並びが偶然出ることはまず無い。
 * ヘイSiri が「Siri」だけでないのも、同じ理由。
 *
 * 作業しながら話す人にとっては、
 * <b>誤って反応しないこと</b>のほうが大事になる。
 */
func 呼びかけの言い方か(_ 言葉: String, _ 呼び名: String) -> Bool {
    return 言葉.contains(呼び名)
}

// 覚えた声は、声の部分だけを取り出してから使う。
// 無音まで比べていたので、静かなときに反応していた。
//
// 以前は、ここで1つも無ければ止めていた。
// 「まず『言葉を教える』で録ってから」という前提だった。
//
// いまは止めない。1つも無いときは、あとの待ち受けループが
// 「聞き取り.app」（自由な文字起こし）で最初の一声を確かめ、
// それを最初の手本として自分で覚える。
// 教えずに、話しかけるだけで始められるようにするため。
var 型たち = 覚えた全部
    .filter { 呼びかけの言い方か($0.言葉, 呼び名) }
    .map { 平均を差し引く(声の部分だけにする($0.特徴)) }
    .filter { $0.count >= 8 }

// 出力をためない。
//
// ためると、記録に書き出す前に終わったときに全部消える。
// 「動いているのに記録が空」に見えて、
// 何が起きているか分からなくなる。
setbuf(stdout, nil)

if 型たち.isEmpty {
    print("「\(呼び名)」の声はまだ覚えていません。")
    print("「\(呼び名)」と話しかけていただければ、聞き取れた時点で自分で覚えます。")
} else {
    print("「\(呼び名)」を \(型たち.count)通りの言い方で覚えています。待ち受けます。")
}
let 用件の数 = Set(覚えた全部.map { $0.言葉 }).count - 1
print("用件として聞き分けられる言葉: \(max(0, 用件の数))語")
print("音はこの端末の中だけで扱い、どこへも送りません。録音も残しません。")

let engine = AVAudioEngine()
let 入力 = engine.inputNode

// マイクの形は inputFormat から取る。
//
// ここは outputFormat を使っていた。
// そのせいで形が合わず、待ち受けは起動した直後に落ちていた。
//   Failed to create tap due to format mismatch
//
// しかも落ちたことが分かりにくかった。
// 見張りが立て直すので、いつも「動いている」ように見え、
// 「呼んでも反応しない」だけが残っていた。
//
// installTap には nil を渡すのがいちばん確かで、
// そうすると入力そのものの形が使われる。
let 元の形 = 入力.inputFormat(forBus: 0)
let 周波数 = 元の形.sampleRate
let 帯たち = メル帯を作る(周波数)

// 聞き取る窓は4秒ぶん。
//
// 2秒にしていたところ、
// 覚えた声（769フレーム＝約4秒）が窓に収まらず、
// <b>比べる前に毎回弾かれていた</b>。
//
// 214回も声を聞いていたのに、ずれが inf のままだった。
// 「呼んでも反応しない」の正体はこれ。
//
// 窓を広げると計算は増えるが、
// 0.4秒ごとに一度なので、待たされるほどではない。
let 持ち回る = Int(周波数 * 4.0)
var 環 = [Float](repeating: 0, count: 持ち回る)
var 環の位置 = 0
let 錠 = NSLock()

// format に nil を渡す。
// 入力そのものの形が使われるので、食い違いが起きない。
入力.installTap(onBus: 0, bufferSize: 4096, format: nil) { buf, _ in
    guard let p = buf.floatChannelData?[0] else { return }
    let n = Int(buf.frameLength)
    錠.lock()
    for i in 0..<n {
        環[環の位置] = p[i]
        環の位置 = (環の位置 + 1) % 持ち回る
    }
    錠.unlock()
}

do {
    try engine.start()
} catch {
    print("マイクを使えませんでした: \(error.localizedDescription)")
    exit(1)
}

var 直前に開いた = Date(timeIntervalSince1970: 0)
var 直前にブートストラップ試行 = Date(timeIntervalSince1970: 0)
var 見た回数 = 0
var 近かった回数 = 0

while true {
    Thread.sleep(forTimeInterval: 0.4)

    錠.lock()
    var 直近 = [Float](repeating: 0, count: 持ち回る)
    for i in 0..<持ち回る {
        直近[i] = 環[(環の位置 + i) % 持ち回る]
    }
    錠.unlock()

    // 静かなときは計算しない。ずっと計算し続けると電池を食う。
    var 力 = 0.0
    for v in 直近 { 力 += Double(v) * Double(v) }
    力 = sqrt(力 / Double(直近.count))
    // 最初の数回は、届いている音の大きさをそのまま出す。
    //
    // 「反応しない」と言われたとき、
    // 音が届いていないのか、小さすぎるのかが分からないと、
    // 直しようがない。
    if 見た回数 <= 6 {
        print("音の大きさ: \(String(format: "%.4f", 力))"
            + (力 < 0.01 ? "（小さいので聞き流します）" : "（聞き取ります）"))
    }

    if 力 < 0.01 { continue }

    // 聞いた音も、声の部分だけを取り出す。
    //
    // 4秒の窓のうち、実際に声が出ているのは1秒ほど。
    // 残りの無音まで比べると、
    // 無音の長さで結果が変わってしまう。
    let 特徴まるごと = MFCCにする(直近, 周波数, 帯たち)
    if 特徴まるごと.count < 4 { continue }
    let 特徴 = 声の部分だけにする(特徴まるごと)
    if 特徴.count < 8 { continue }

    // 音そのものが届いているかを、一度だけ確かめる。
    //
    // 「呼んでも反応しない」と言われたとき、
    // 音が届いていないのか、届いているが遠いのかで、直し方がまるで違う。
    //
    // ここは見張りの輪の中。順番が決まっているので安全。
    // 別のところから同時に環を覗く形で書いたら、待ち受けごと落ちた。

    // 声らしい音が来ていることは、記録に残す。
    //
    // 呼びかけに届かなかったときも、
    // 「音は来ていたが遠かった」のか
    // 「音そのものが来ていない」のかが分かる。
    見た回数 += 1

    // まだ誰の声も覚えていないなら、自由な聞き取り（Speech）で
    // 最初の一声を確かめ、覚える。
    //
    // 「まず教えてから使う」をやめて、<b>使いながら覚える</b>ようにした。
    // 話しかけるだけで、教える手間なしに始められるようにするため。
    //
    // 聞き取りには時間がかかるので、声らしい大きさのときだけ、
    // かつ間を置いて試す（毎回0.4秒ごとに試すと、機械にもマイクにも重い）。
    if 型たち.isEmpty {
        guard 力 > 0.03,
              Date().timeIntervalSince(直前にブートストラップ試行) >= 2.0
        else { continue }
        直前にブートストラップ試行 = Date()

        let 試しの道 = NSTemporaryDirectory()
            + "areglm_初回_\(Int(Date().timeIntervalSince1970 * 1000)).aiff"
        var 覚えた = false
        if AIFFに書く(直近, 周波数: 周波数, 道: 試しの道),
           let 聞こえた文 = 自由に聞き取る(試しの道),
           呼び名として聞こえたか(聞こえた文, 呼び名) {

            print("「\(聞こえた文)」と聞こえました。「\(呼び名)」として覚えます。")
            let 手本 = 平均を差し引く(特徴)
            覚え足す(型の道, 呼び名, 手本)
            型たち.append(手本)
            覚えた = true
        }
        try? FileManager.default.removeItem(atPath: 試しの道)

        // 覚えられなかったら、この巡は静かに終える。
        guard 覚えた else { continue }
        // ここでは continue しない。
        // いま覚えたばかりの手本を含めて、下の通常の判定にそのまま進む。
        // 自分自身と比べることになるので、まず必ず「近い」と出て、
        // このあと「はい」と返事をし、続けて用件も聞く。
    }

    var 最小 = Double.infinity
    for 型 in 型たち {
        最小 = min(最小, 中から探す(特徴, 型))
    }

    // 呼び名は厳しめに見る。
    //
    // ここは特に慎重にしてある。
    // 人と話している最中に勝手に反応されるのが、いちばん困るため。
    // 「呼んだのに動かない」は言い直せばよいが、
    // 「呼んでいないのに動く」は会話を邪魔する。
    //
    // だから三つの条件を全部満たしたときだけ応じる:
    //   1. 覚えた呼び名と、はっきり近いこと（26以下）
    //   2. 呼びかけの前が静かなこと（会話の途中ではないこと）
    //   3. 直前に反応していないこと
    // どれくらい近かったかを残す。
    //
    // 「呼んでも反応しない」と言われたとき、
    // これが無いと、惜しかったのか、まるで違ったのかが分からない。
    // 分からないまま上限をいじるのは、当てずっぽうになる。
    //
    // はっきり声を出したときだけ出す。
    // 小さな物音まで全部出すと、記録が埋まって読めない。
    if 力 > 0.03 {
        近かった回数 += 1
        print("声を聞きました（大きさ \(String(format: "%.3f", 力))／"
            + "呼び名とのずれ \(String(format: "%.1f", 最小))／"
            + "\(最小 <= 呼び名と認める上限 ? "近い" : "遠い（上限 \(Int(呼び名と認める上限))）")）")
    }

    if 最小 <= 呼び名と認める上限 {

        // --- 会話の途中ではないかを見る ---
        //
        // 人と話しているとき、声はずっと続いている。
        // 名前を呼ぶときは、ふつうその前に一息ある。
        // 直前の0.6秒が静かでなければ、会話の流れの中とみなして応じない。
        let 見る幅 = Int(周波数 * 0.6)
        var 前の力 = 0.0
        let 始 = max(0, 直近.count - 持ち回る + 0)
        for i in 始..<min(始 + 見る幅, 直近.count) {
            前の力 += Double(直近[i]) * Double(直近[i])
        }
        前の力 = sqrt(前の力 / Double(max(1, 見る幅)))

        // 呼ぶ前が静かかどうかを見る。
        //
        // ただし、ここを厳しくしすぎると
        // 「呼んでも反応しない」がずっと続く。
        //
        // 誤って反応するのは会話を邪魔するが、
        // <b>呼んでも動かないのは、道具として使えない</b>。
        // 使えないほうが困るので、ここは緩める。
        //
        // ずれが十分に小さい（はっきり呼び名だと分かる）ときは、
        // 前が多少うるさくても応じる。
        // 音楽やテレビの中の音で反応することはまずない。
        // 「話しかけられたとき」だけ応じる。
        //
        // 作業しながら話す人にとっては、
        // <b>誤って反応しないこと</b>のほうが大事になる。
        // 独り言や、人との会話に割り込まれるのは邪魔でしかない。
        //
        // 「呼んだのに動かない」は言い直せばよい。
        // 「呼んでいないのに動く」は、言い直しようがない。
        // だから、迷ったら応じない側に倒す。

        let はっきり呼ばれた = 最小 <= 呼び名と認める上限 * 0.7

        // 呼びかけの前に、一息あるか。
        //
        // 人に話しかけるときは、ふつう一度言葉が切れる。
        // 話し続けている途中に呼び名らしき音が混じっても、
        // それは呼びかけではない。
        //
        // ただし、はっきり合っているなら通す。
        // 「ねぇアレラム」ほど特徴のある並びが偶然出ることは、まず無い。
        if !はっきり呼ばれた && 前の力 > 静かとみなす上限 * 1.5 {
            continue
        }

        // 続けて何度も反応しない。
        //
        // 一度応じたら、しばらく黙る。
        // 同じ呼びかけに二度三度と反応すると、うるさい。
        if Date().timeIntervalSince(直前に開いた) < 6 { continue }
        直前に開いた = Date()

        print("呼ばれました（ずれ \(String(format: "%.1f", 最小))）")

        // 通った声を、そのまま覚える。
        //
        // これが「使いながら覚える」の入口。
        // 呼びかけが通ったなら、その声は本物の呼びかけ。
        // わざわざ録らなくても、材料が手に入る。
        //
        // 使うほど、朝の声・疲れた声・早口——
        // いろいろな言い方が貯まって、届きやすくなる。
        //
        // ただし、すでにそっくりなものは足さない。
        // 同じような手本ばかり増えても、幅は広がらない。
        // 自動で覚えるのは、<b>はっきり合ったときだけ</b>。
        //
        // はじめ「上限より内側なら覚える」にしていたら、
        // 試している間に12件まで膨れ、
        // そのほとんどが呼びかけではないものだった。
        //
        // 覚えるほど良くなるはずが、
        // 濁ったものが混ざると、かえって当たらなくなる。
        //
        // 条件:
        //   ・ぎりぎりではなく、はっきり合っている（上限の7割以内）
        //   ・すでに持っている言い方と、そこそこ違う（8より遠い）
        //   ・切り出した長さが、呼び名として妥当（短すぎない）
        let はっきり合った = 最小 <= 呼び名と認める上限 * 0.7
        let 新しい言い方 = 最小 > 8.0
        let 長さが妥当 = 特徴.count >= 20

        if はっきり合った && 新しい言い方 && 長さが妥当 {
            覚え足す(型の道, 呼び名, 特徴)
        }
        声で返す("はい")

        // --- ここから用件を聞く ---
        //
        // 呼ばれてすぐは、自分が「はい」と言った声が残っている。
        // それを用件として拾わないよう、いったん捨ててから聞く。
        錠.lock()
        for i in 0..<持ち回る { 環[i] = 0 }
        環の位置 = 0
        錠.unlock()

        // 「はい」の音がマイクから消えるまで、少しだけ待つ。
        Thread.sleep(forTimeInterval: 0.5)

        // 用件は、決まった長さで区切らない。
        //
        // 以前は「3.2秒待って、そのときの4秒ぶんを切り出す」だった。
        // 話し出すのが少し遅い・言うことが少し長いと、
        // 話の途中で切り取られてしまっていた。
        // 「会話が途切れる」という声は、これが原因だったはず。
        //
        // 代わりに、<b>話し始めるまで待ち、話し終わるまで聞く</b>。
        // 話し終わりは「静かな時間がしばらく続いたか」で判断する。
        var 話し始めたか = false
        var 最後に声がした = Date()
        let 話しかけの締切 = Date().addingTimeInterval(10.0)   // ここまで無言なら諦める
        let 話し終わりとみなす静けさ = 1.1

        let 覗く幅 = max(1, Int(周波数 * 0.3))
        while Date() < 話しかけの締切 {
            Thread.sleep(forTimeInterval: 0.2)

            錠.lock()
            let 開始 = (環の位置 - 覗く幅 + 持ち回る * 2) % 持ち回る
            var 一口 = [Float](repeating: 0, count: 覗く幅)
            for i in 0..<覗く幅 { 一口[i] = 環[(開始 + i) % 持ち回る] }
            錠.unlock()

            var 瞬間の力 = 0.0
            for v in 一口 { 瞬間の力 += Double(v) * Double(v) }
            瞬間の力 = sqrt(瞬間の力 / Double(覗く幅))

            if 瞬間の力 > 0.015 {
                話し始めたか = true
                最後に声がした = Date()
            } else if 話し始めたか
                && Date().timeIntervalSince(最後に声がした) > 話し終わりとみなす静けさ {
                break   // 十分静かになった＝話し終わった
            }
        }

        // 何も言われなかったら、黙って戻る
        guard 話し始めたか else {
            print("　用件が聞こえませんでした")
            continue
        }

        錠.lock()
        var 用件の音 = [Float](repeating: 0, count: 持ち回る)
        for i in 0..<持ち回る {
            用件の音[i] = 環[(環の位置 + i) % 持ち回る]
        }
        錠.unlock()

        // まず、端末内の自由な聞き取り（Speech）にかける。
        // これなら、教えていない言い方でも文字にできる。
        var 聞こえた言葉 = ""
        let 用件の道 = NSTemporaryDirectory()
            + "areglm_用件_\(Int(Date().timeIntervalSince1970 * 1000)).aiff"
        if AIFFに書く(用件の音, 周波数: 周波数, 道: 用件の道) {
            聞こえた言葉 = 自由に聞き取る(用件の道) ?? ""
        }
        try? FileManager.default.removeItem(atPath: 用件の道)

        if !聞こえた言葉.isEmpty {
            print("　用件（自由な聞き取り）: 「\(聞こえた言葉)」")
        } else {
            // 自由な聞き取りが失敗・未整備のときは、
            // このツール自作の聞き分け（教えた呼び名との近さ比べ）に戻す。
            let 用件の特徴 = MFCCにする(用件の音, 周波数, 帯たち)
            if 用件の特徴.count < 4 {
                声で返す("聞き取れませんでした")
                continue
            }

            // 覚えた言葉の中から、いちばん近いものを探す。
            // 呼び名そのものは除く（「アレラム」だけ言われても用件にならない）。
            var いちばん近い = Double.infinity
            for x in 覚えた全部 where x.言葉 != 呼び名 {
                let d = 中から探す(用件の特徴, x.特徴)
                if d < いちばん近い {
                    いちばん近い = d
                    聞こえた言葉 = x.言葉
                }
            }

            // 近いものが無ければ、当てずに正直に言う。
            // 違う作業を勝手に始める方が、聞き返すより困る。
            if 聞こえた言葉.isEmpty || いちばん近い > 45 {
                print("　用件が分かりませんでした（ずれ \(String(format: "%.1f", いちばん近い))）")
                声で返す("すみません、聞き取れませんでした。覚えていない言葉のようです")
                continue
            }
            print("　用件（自作の聞き分け）: 「\(聞こえた言葉)」（ずれ \(String(format: "%.1f", いちばん近い))）")
        }

        // この端末の中のAIに渡して、答えを声で返す
        if let 答え = 端末の中のAIに聞く(聞こえた言葉) {
            print("　答え: \(答え.prefix(60))")
            声で返す(答え)
        } else {
            声で返す("いま考える仕組みが動いていないようです")
        }

        // 自分がしゃべった声を、次の呼びかけとして拾わないようにする
        錠.lock()
        for i in 0..<持ち回る { 環[i] = 0 }
        環の位置 = 0
        錠.unlock()
        直前に開いた = Date()
    }
}
