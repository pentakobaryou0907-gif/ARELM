# -*- coding: utf-8 -*-
"""
アップロードされた写真・動画から、デザインの傾向を学ぶ

なぜこれが要るのか:
    「アップロードした写真や動画をインスパイアして、デザインや
    ファッションの流行を分析してほしい」という依頼に応えるため。

    外部の画像認識AI（CLIP等）は使わない。この端末に既にある
    Pillow・numpyだけで完結する、単純な色・構図の分析に留める。

正直に書いておくこと:
    ここでやっているのは「何のアイテムか」「どんなブランドの
    雰囲気か」を当てる高度な認識ではない。色分布と明暗・彩度の
    傾向から、ごく単純な日本語キーワード（トーン・配色の系統）に
    変換しているだけ。学習した内容はあくまで参考程度のものとして
    扱ってほしい。

対応形式:
    画像 … Pillow で読める形式（jpg/png/webp等）
    動画 … ffmpeg があれば、数枚のフレームを抜き出して画像と同様に見る。
           ffmpeg が無い端末では、正直に「解析できません」と伝える
          （server/ai/画像を作る.py の pdftotext 呼び出しと同じ考え方）。
"""

import base64
import io
import os
import re
import shutil
import subprocess
import tempfile

from PIL import Image
import numpy as np


def _画像を開く(path_or_dataurl):
    """data URL(base64) でもファイルパスでも読めるようにする。"""
    if not path_or_dataurl:
        raise ValueError('画像データがありません')
    if path_or_dataurl.startswith('data:'):
        m = re.match(r'data:[^;]+;base64,(.+)', path_or_dataurl, re.S)
        if not m:
            raise ValueError('画像データの形式が正しくありません')
        raw = base64.b64decode(m.group(1))
        return Image.open(io.BytesIO(raw)).convert('RGB')
    return Image.open(path_or_dataurl).convert('RGB')


def _主要色を抽出(img, 色数=4):
    """
    簡易k-means。外部ライブラリを増やさず、numpyだけで実装する。
    厳密なクラスタリングでなくてよい（大まかな配色の傾向が拾えれば十分）。
    """
    small = img.resize((48, 48))
    arr = np.asarray(small).reshape(-1, 3).astype(float)

    rng = np.random.default_rng(0)
    idx = rng.choice(len(arr), size=min(色数, len(arr)), replace=False)
    centers = arr[idx].copy()

    for _ in range(8):
        差 = arr[:, None, :] - centers[None, :, :]
        距離 = (差 ** 2).sum(axis=2)
        labels = 距離.argmin(axis=1)
        for k in range(len(centers)):
            pts = arr[labels == k]
            if len(pts):
                centers[k] = pts.mean(axis=0)

    counts = np.bincount(labels, minlength=len(centers))
    順 = np.argsort(-counts)
    return [(tuple(int(v) for v in centers[i]), int(counts[i])) for i in 順]


def _色を日本語にする(rgb):
    """
    厳密な色名判定ではない。明るさ・彩度の大まかな傾向を
    ファッションでよく使う言い回しに寄せているだけ。
    """
    r, g, b = rgb
    明るさ = (r + g + b) / 3
    最大差 = max(r, g, b) - min(r, g, b)

    if 最大差 < 15:
        if 明るさ < 70:
            return 'モノトーン（ダーク系）'
        if 明るさ > 190:
            return 'モノトーン（ライト系）'
        return 'モノトーン（グレー系）'
    if 明るさ < 60:
        return 'ダークトーン'
    if r > g and g >= b and (r - b) > 25:
        return 'アースカラー（ブラウン・ベージュ系）'
    if b > r and b > g:
        return 'ブルー系'
    if g > r and g > b:
        return 'グリーン系'
    if r > 200 and g < 150 and b < 150:
        return 'ビビッドな赤系'
    if 明るさ > 190:
        return 'パステル系'
    return 'ニュートラル系'


def 画像から特徴を取り出す(path_or_dataurl):
    """
    @return {'ok': bool, 'キーワード': [...], '構図': str, 'サイズ': {...}} など
    """
    try:
        img = _画像を開く(path_or_dataurl)
    except Exception as e:
        return {'ok': False, '訳': f'画像を読み込めませんでした: {e}'}

    幅, 高さ = img.size
    主要色 = _主要色を抽出(img)

    キーワード = []
    for rgb, _cnt in 主要色:
        名 = _色を日本語にする(rgb)
        if 名 not in キーワード:
            キーワード.append(名)

    明るさ一覧 = [sum(rgb) / 3 for rgb, _ in 主要色]
    if 明るさ一覧 and (max(明るさ一覧) - min(明るさ一覧)) > 120:
        キーワード.append('ハイコントラスト')

    if 幅 == 0 or 高さ == 0:
        構図 = '不明'
    elif abs(幅 - 高さ) / max(幅, 高さ) < 0.15:
        構図 = '正方形に近い構図'
    elif 幅 > 高さ:
        構図 = '横長の構図'
    else:
        構図 = '縦長の構図'

    return {
        'ok': True,
        'キーワード': キーワード[:5],
        '構図': 構図,
        'サイズ': {'幅': 幅, '高さ': 高さ},
    }


def 動画から特徴を取り出す(path, フレーム数=5):
    """
    ffmpegで数フレーム抜き出し、それぞれを画像として分析して傾向をまとめる。

    ffmpegが無い端末では、正直に解析できない旨を返す
    （代わりに嘘の分析結果を作ったりはしない）。
    """
    if not shutil.which('ffmpeg'):
        return {
            'ok': False,
            '訳': 'ffmpegが無いため動画は解析できません（brew install ffmpeg 等の導入が必要です）',
        }

    tmpdir = tempfile.mkdtemp(prefix='areglm_frames_')
    try:
        パターン = os.path.join(tmpdir, 'frame_%02d.jpg')
        コマンド = [
            'ffmpeg', '-y', '-i', path,
            '-vf', 'fps=1/2', '-frames:v', str(フレーム数),
            パターン,
        ]
        try:
            結果 = subprocess.run(コマンド, capture_output=True, timeout=120)
        except subprocess.TimeoutExpired:
            return {'ok': False, '訳': '動画の解析が時間内に終わりませんでした'}

        if 結果.returncode != 0:
            詳細 = 結果.stderr.decode('utf-8', errors='ignore')[:300]
            return {'ok': False, '訳': f'ffmpegでのフレーム抽出に失敗しました: {詳細}'}

        フレームたち = sorted(f for f in os.listdir(tmpdir) if f.endswith('.jpg'))
        if not フレームたち:
            return {'ok': False, '訳': '動画からフレームを取り出せませんでした'}

        キーワードの頻度 = {}
        for fname in フレームたち:
            特徴 = 画像から特徴を取り出す(os.path.join(tmpdir, fname))
            if not 特徴.get('ok'):
                continue
            for k in 特徴['キーワード']:
                キーワードの頻度[k] = キーワードの頻度.get(k, 0) + 1

        if not キーワードの頻度:
            return {'ok': False, '訳': 'フレームから特徴を抽出できませんでした'}

        上位 = sorted(キーワードの頻度.items(), key=lambda x: -x[1])
        return {
            'ok': True,
            'キーワード': [k for k, _ in 上位[:5]],
            '解析フレーム数': len(フレームたち),
        }
    finally:
        for f in os.listdir(tmpdir):
            try:
                os.remove(os.path.join(tmpdir, f))
            except OSError:
                pass
        try:
            os.rmdir(tmpdir)
        except OSError:
            pass


def 特徴をテキストにする(特徴):
    """学習用の短い文（例:「ダークトーン アースカラー ハイコントラスト」）に変換する。"""
    if not 特徴 or not 特徴.get('ok'):
        return ''
    parts = list(特徴.get('キーワード') or [])
    if 特徴.get('構図'):
        parts.append(特徴['構図'])
    return ' '.join(parts)
