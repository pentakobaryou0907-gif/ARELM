//
// 端末内だけで音声を文字にする
//
// なぜこれが要るのか:
//   ブラウザ標準の音声認識は、音声をGoogleのサーバーへ送っている。
//   「外部に一切送らない」という、このツールでいちばん大事な約束に
//   真正面から反していた。
//
//   macOS には、端末の中だけで音声を文字にする仕組みが入っている。
//   Apple 公式・追加費用なし・ライセンス表示不要。
//   これを使えば、音声が外へ出ることはない。
//
// ここでの決めごと:
//   requiresOnDeviceRecognition を true にする。
//   これが false だと Apple のサーバーへ送られてしまう。
//   端末内でできない場合は、黙って外へ送らず、はっきり断る。
//
// 使い方:
//   swiftc -O 端末内音声認識.swift -o 端末内音声認識
//   ./端末内音声認識 <音声ファイル>
//   ./端末内音声認識 --check    … 使える状態かを調べる
//

import Foundation
import Speech

/// 結果をJSONで返す。呼び出し側が扱いやすいようにするため。
func 出力(_ 中身: [String: Any]) {
    if let d = try? JSONSerialization.data(withJSONObject: 中身, options: [.withoutEscapingSlashes]),
       let s = String(data: d, encoding: .utf8) {
        print(s)
    }
    exit(中身["ok"] as? Bool == true ? 0 : 1)
}

/// 使える状態かを調べる。
///
/// 許可を求める前に、まず端末内認識に対応しているかを見る。
/// 対応していない端末で許可だけ求めても、意味がないため。
func 状態を調べる() {
    let 認識器 = SFSpeechRecognizer(locale: Locale(identifier: "ja-JP"))

    guard let r = 認識器 else {
        出力(["ok": false, "reason": "日本語の音声認識がこの端末にありません"])
        return
    }

    let 端末内可能 = r.supportsOnDeviceRecognition
    let 許可 = SFSpeechRecognizer.authorizationStatus()

    let 許可の言葉: String
    switch 許可 {
    case .authorized:     許可の言葉 = "許可済み"
    case .denied:         許可の言葉 = "拒否されています"
    case .restricted:     許可の言葉 = "この端末では使えません"
    case .notDetermined:  許可の言葉 = "まだ許可を求めていません"
    @unknown default:     許可の言葉 = "不明"
    }

    出力([
        "ok": 端末内可能,
        "端末内で認識できるか": 端末内可能,
        "許可": 許可の言葉,
        "使える": 端末内可能 && 許可 == .authorized,
        "reason": 端末内可能 ? "" : "この端末は端末内での音声認識に対応していません",
    ])
}

/// 許可を求める。初回だけ必要。
///
/// RunLoop.main.run() で待つと、待つものが無いとすぐ戻ってしまい、
/// 許可のダイアログが出る前に終了していた。
/// 待ち合わせの仕組みで、答えが返るまで確実に待つ。
func 許可を求めて待つ() -> SFSpeechRecognizerAuthorizationStatus {
    var 結果 = SFSpeechRecognizer.authorizationStatus()
    if 結果 == .authorized { return 結果 }

    let 待ち = DispatchSemaphore(value: 0)
    SFSpeechRecognizer.requestAuthorization { 状態 in
        結果 = 状態
        待ち.signal()
    }

    // 人が答えるまで待つ。ただし無限には待たない。
    if 待ち.wait(timeout: .now() + 90) == .timedOut {
        return SFSpeechRecognizer.authorizationStatus()
    }
    return 結果
}

/// 音声ファイルを文字にする。
///
/// 外へ出さないことを確かめてから始める。
/// 端末内でできない場合は、送らずに断る。
func 文字にする(_ 道: String) {
    let url = URL(fileURLWithPath: 道)

    guard FileManager.default.fileExists(atPath: 道) else {
        出力(["ok": false, "reason": "音声ファイルが見つかりません: \(道)"])
        return
    }

    guard let 認識器 = SFSpeechRecognizer(locale: Locale(identifier: "ja-JP")) else {
        出力(["ok": false, "reason": "日本語の音声認識がこの端末にありません"])
        return
    }

    guard 認識器.supportsOnDeviceRecognition else {
        // ここで外へ送る道もあるが、選ばない。
        // 「外に出さない」という約束のほうが大事だから。
        出力(["ok": false, "reason": "この端末は端末内での認識に対応していません。外へ送ることはしません。"])
        return
    }

    let 要求 = SFSpeechURLRecognitionRequest(url: url)

    // これが false だと Apple のサーバーへ送られる。必ず true にする。
    要求.requiresOnDeviceRecognition = true
    要求.shouldReportPartialResults = false

    let 待ち = DispatchSemaphore(value: 0)
    var 出た文字 = ""
    var 出た誤り: String? = nil

    認識器.recognitionTask(with: 要求) { 結果, 誤り in
        if let e = 誤り {
            出た誤り = e.localizedDescription
            待ち.signal()
            return
        }
        guard let r = 結果 else { return }
        出た文字 = r.bestTranscription.formattedString
        if r.isFinal { 待ち.signal() }
    }

    // 長い音声でも待てるようにするが、無限には待たない。
    // 待ち続けると、呼び出し側が止まってしまう。
    let 結果 = 待ち.wait(timeout: .now() + 120)

    if 結果 == .timedOut {
        出力(["ok": false, "reason": "時間内に終わりませんでした（2分）"])
        return
    }

    if let e = 出た誤り {
        出力(["ok": false, "reason": e])
        return
    }

    出力([
        "ok": true,
        "text": 出た文字,
        "外部送信": false,
        "note": "この端末の中だけで文字にしました。音声は外へ出ていません。",
    ])
}

// ---------- 入口 ----------

let 引数 = CommandLine.arguments

if 引数.count < 2 {
    出力(["ok": false, "reason": "使い方: 端末内音声認識 <音声ファイル> / --check / --auth"])
}

switch 引数[1] {
case "--check":
    状態を調べる()

case "--auth":
    let 状態 = 許可を求めて待つ()
    let 許された = (状態 == .authorized)
    出力([
        "ok": 許された,
        "許可": 許された ? "許可済み" : "許可されていません",
        "reason": 許された ? ""
            : "許可されませんでした。システム設定 → プライバシーとセキュリティ → 音声認識 で AReGLM を許可してください。",
    ])

default:
    // 許可がまだなら、先に求めてから始める
    if 許可を求めて待つ() != .authorized {
        出力(["ok": false, "reason": "音声認識が許可されていません。システム設定 → プライバシーとセキュリティ → 音声認識 で AReGLM を許可してください。"])
    }
    文字にする(引数[1])
}
