# -*- coding: utf-8 -*-
"""
音声を文字にする ― この端末の中だけで動く音声認識（Whisper）

なぜこれが要るのか:

    以前は macOS の SFSpeechRecognizer を素の実行ファイルから呼ぶ形
    （server/voice/端末内音声認識）を試したが、アプリとしての署名・権限が
    無いと使えず、起動するとクラッシュしていた（Appleの有料開発者証明書が要る）。

    ブラウザ内蔵の音声認識（Web Speech API）は、Chromeでは
    音声をGoogleのサーバーへ送ってしまい、「外部へは一切送らない」という
    このツールの前提を壊す。

    Ollamaでローカルの文章生成AIを動かしているのと同じ考え方で、
    無料・オープンソースの学習済み音声認識モデル（Whisper）を、
    この端末の中だけで動かす。証明書もクラウドも要らない。

使うモデル:
    faster-whisper（Whisperのモデルを、より軽く速く動かす実装）
    small（多言語・約480MB）

    ・MITライセンス（無料・商用利用可）
    ・日本語を含む多言語対応
    ・CPUだけでも現実的な速さで動く

安全のために:
    ・音声ファイルはこの関数の外（呼び出し側）で一時的に置かれ、
      文字にしたら呼び出し側が消す。ここでは複製を残さない。
    ・モデルは初回の呼び出しで読み込む（起動を遅くしないため）。
    ・外部のサーバーには一切接続しない。
"""

_モデル = None
_読み込み失敗 = None


def _モデルを読む():
    """モデルを一度だけ読み込む。二度目からはそのまま使い回す。"""
    global _モデル, _読み込み失敗
    if _モデル is not None or _読み込み失敗:
        return _モデル

    try:
        from faster_whisper import WhisperModel
        # この端末に既に取ってあるモデルだけを使う。
        # local_files_only を付けないと、更新の確認だけのつもりで
        # Hugging Face へ問い合わせに行こうとし、
        # 「外部へは一切送らない」の関所（rules.block_external_network）に
        # 止められてしまっていた。もう手元にあるものだけで十分。
        _モデル = WhisperModel('small', device='cpu', compute_type='int8', local_files_only=True)
        return _モデル
    except Exception as e:
        _読み込み失敗 = str(e)
        return None


def 使えるか():
    """
    音声認識が使える状態か（モデルが用意できているか）を確かめる。

    実際にモデルを読み込んでみて確かめる
    （最初の1回だけ数十秒かかることがある）。
    """
    return _モデルを読む() is not None


def 状態を返す():
    """
    実際にモデルを読み込めるか、その場で確かめて返す。

    以前は「まだ試していないので、たぶん使えます」と楽観的に答えていたが、
    実際に話しかけたときに読み込みが失敗すると、
    状態表示と食い違ってしまう。読める・読めないをここで確定させる。
    """
    if 使えるか():
        return {'ok': True, '使える': True, '訳': '端末内のWhisper（small）で認識します。音声は外へ出ません。'}
    return {
        'ok': False, '使える': False,
        'reason': f'音声認識モデルを読み込めませんでした: {_読み込み失敗}',
    }


def 文字にする(音声ファイルの場所):
    """
    音声ファイルを文字にする。

    @param 音声ファイルの場所  この端末の中にある、音声ファイルのパス
    @return {'ok': bool, 'text': str, 'reason': str|None}
    """
    m = _モデルを読む()
    if not m:
        return {'ok': False, 'text': '', 'reason': f'音声認識モデルを読み込めませんでした: {_読み込み失敗}'}

    try:
        segments, info = m.transcribe(
            音声ファイルの場所,
            language='ja',
            vad_filter=True,   # 無音部分を飛ばし、余計な文字が混ざるのを防ぐ
        )
        text = ''.join(s.text for s in segments).strip()
        if not text:
            return {'ok': False, 'text': '', 'reason': '声が聞き取れませんでした'}
        return {'ok': True, 'text': text, 'reason': None}
    except Exception as e:
        return {'ok': False, 'text': '', 'reason': f'文字にできませんでした: {e}'}
