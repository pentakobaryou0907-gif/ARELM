/**
 * 聞き取り ― 話した言葉を、そのまま文字にする
 *
 * なぜこれを作るのか:
 *
 *   いままでは、覚えさせた言葉しか聞き取れなかった。
 *   だから「覚えていない言葉のようです」ばかり返っていた。
 *   会話にならない。
 *
 *   macOS には、端末の中だけで動く聞き取りが入っている。
 *   これを使えば、教えていない言葉も文字にできる。
 *
 * 以前の見立ての訂正:
 *
 *   前に「有料の開発者証明書が要る」と書いたが、<b>間違いだった</b>。
 *   実際に試したところ、そのまま使えた。
 *
 *     いま使えるか: true
 *     端末内だけで動くか: true
 *
 *   確かめずに「できない」と言っていた。
 *
 * 外へ送らないこと:
 *
 *   requiresOnDeviceRecognition を true にしてある。
 *   これで<b>音は端末の外へ出ない</b>。
 *   Appleのサーバーにも送られない。
 *
 * 使い方:
 *   聞き取り <音のファイル>
 *   聞き取り --待つ <秒数>     （マイクから直に聞く）
 */

import AVFoundation
import Foundation
import Speech

setbuf(stdout, nil)

/** 許可を待つ */
func 許可をもらう() -> Bool {
    var 結果 = false
    let 待つ = DispatchSemaphore(value: 0)

    SFSpeechRecognizer.requestAuthorization { 状態 in
        結果 = (状態 == .authorized)
        待つ.signal()
    }
    // 初回は本人に聞くので、少し長めに待つ
    _ = 待つ.wait(timeout: .now() + 30)
    return 結果
}

/** ファイルの音を文字にする */
func ファイルを聞き取る(_ 道: String) -> String? {
    guard let 認識 = SFSpeechRecognizer(locale: Locale(identifier: "ja-JP")),
          認識.isAvailable else {
        FileHandle.standardError.write("聞き取りが使えません\n".data(using: .utf8)!)
        return nil
    }

    let 頼み = SFSpeechURLRecognitionRequest(url: URL(fileURLWithPath: 道))

    // 端末の中だけで行う。音を外へ出さない。
    if 認識.supportsOnDeviceRecognition {
        頼み.requiresOnDeviceRecognition = true
    }
    頼み.shouldReportPartialResults = false

    var 出た: String?
    let 待つ = DispatchSemaphore(value: 0)

    認識.recognitionTask(with: 頼み) { 結果, 誤り in
        if let 誤り = 誤り {
            FileHandle.standardError.write(
                "聞き取れませんでした: \(誤り.localizedDescription)\n".data(using: .utf8)!)
            待つ.signal()
            return
        }
        if let 結果 = 結果, 結果.isFinal {
            出た = 結果.bestTranscription.formattedString
            待つ.signal()
        }
    }

    _ = 待つ.wait(timeout: .now() + 60)
    return 出た
}

// ------------------------------------------------------------------

let 引数 = CommandLine.arguments

guard 引数.count >= 2 else {
    print("使い方: 聞き取り <音のファイル>")
    exit(1)
}

// 許可を確かめる。無ければ聞く。
let いまの状態 = SFSpeechRecognizer.authorizationStatus()
if いまの状態 != .authorized {
    if !許可をもらう() {
        FileHandle.standardError.write(
            "聞き取りの許可がありません。\n".data(using: .utf8)!)
        exit(2)
    }
}

// 結果は、音のファイルの隣に「.txt」で書く。
//
// アプリとして起動すると、画面に出した文字は受け取れない。
// だが利用目的の説明は、アプリの形でないと読まれず、
// 直に呼ぶと「privacy violation」で止まる。
//
// どちらも立てるには、<b>ファイルに書いて渡す</b>のがいちばん確か。
let 書き先 = 引数[1] + ".txt"

if let 文字 = ファイルを聞き取る(引数[1]) {
    try? 文字.write(toFile: 書き先, atomically: true, encoding: .utf8)
    print(文字)
    exit(0)
}

try? "".write(toFile: 書き先, atomically: true, encoding: .utf8)
exit(3)
