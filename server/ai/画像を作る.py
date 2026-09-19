# -*- coding: utf-8 -*-
"""
画像を作る ― この端末で動く ComfyUI を使い、絵を生成する

なぜこれが要るのか:

    マスタープロンプトに「商品アイディアの画像生成」「画像・3Dモデル・動画生成の強化」
    とある。この端末には、すでに ComfyUI（無料・オープンソース・完全ローカル）と
    Flux.2 Klein のモデル一式が入っている（/Users/ari/ComfyUI）。

    GPTやMidjourneyのような外部の画像生成APIは使わない。
    端末の中で動く ComfyUI に絵を頼み、できた絵をそのまま受け取るだけ。
    外部へは一切送らない。

出所:

    ここで組み立てるワークフロー（グラフ）は、
    ComfyUI 側にすでに保存されていた
    「image_flux2_klein_text_to_image.json」を元にしている。
    一から当てずっぽうで作ったものではない。

正直に書いておくこと:

    Flux.2 Klein は UNET が約7.7GB、文字を読む部分が約8GBあり、
    この端末（メモリ16GB）では余裕があるとは言えない。
    遅い・失敗することがある。失敗したら、そのまま正直に伝える。
"""

import json
import time
import urllib.error
import urllib.request
import uuid

COMFYUI_の場所 = 'http://127.0.0.1:8188'

# ComfyUI/user/default/workflows/image_flux2_klein_text_to_image.json を元にした構成。
UNET名 = 'flux-2-klein-4b.safetensors'
CLIP名 = 'qwen_3_4b.safetensors'
VAE名 = 'flux2-vae.safetensors'


def 使えるか(タイムアウト=2):
    """ComfyUI が動いているか確かめる。"""
    try:
        with urllib.request.urlopen(
                f'{COMFYUI_の場所}/system_stats', timeout=タイムアウト) as 応答:
            return 応答.status == 200
    except (urllib.error.URLError, OSError, TimeoutError):
        return False


def _グラフを組む(プロンプト, 幅, 高さ, 種):
    """
    API形式のグラフを組み立てる。

    保存済みワークフロー（image_flux2_klein_text_to_image.json）にある
    ノードの繋がりを、そのまま素直に書き起こしたもの。
    プリミティブ（値だけのノード）は、繋ぎ先へ直接値を入れて省いている。
    """
    return {
        'unet': {
            'class_type': 'UNETLoader',
            'inputs': {'unet_name': UNET名, 'weight_dtype': 'default'},
        },
        'clip': {
            'class_type': 'CLIPLoader',
            'inputs': {'clip_name': CLIP名, 'type': 'flux2', 'device': 'default'},
        },
        'vae': {
            'class_type': 'VAELoader',
            'inputs': {'vae_name': VAE名},
        },
        'pos_cond': {
            'class_type': 'CLIPTextEncode',
            'inputs': {'clip': ['clip', 0], 'text': プロンプト},
        },
        'neg_cond': {
            'class_type': 'ConditioningZeroOut',
            'inputs': {'conditioning': ['pos_cond', 0]},
        },
        'guider': {
            'class_type': 'CFGGuider',
            'inputs': {
                'model': ['unet', 0], 'positive': ['pos_cond', 0],
                'negative': ['neg_cond', 0], 'cfg': 1,
            },
        },
        'sampler_sel': {
            'class_type': 'KSamplerSelect',
            'inputs': {'sampler_name': 'euler'},
        },
        'noise': {
            'class_type': 'RandomNoise',
            'inputs': {'noise_seed': 種},
        },
        'latent': {
            'class_type': 'EmptyFlux2LatentImage',
            'inputs': {'width': 幅, 'height': 高さ, 'batch_size': 1},
        },
        'sigmas': {
            'class_type': 'Flux2Scheduler',
            'inputs': {'steps': 4, 'width': 幅, 'height': 高さ},
        },
        'sample': {
            'class_type': 'SamplerCustomAdvanced',
            'inputs': {
                'noise': ['noise', 0], 'guider': ['guider', 0],
                'sampler': ['sampler_sel', 0], 'sigmas': ['sigmas', 0],
                'latent_image': ['latent', 0],
            },
        },
        'decode': {
            'class_type': 'VAEDecode',
            'inputs': {'samples': ['sample', 0], 'vae': ['vae', 0]},
        },
        'save': {
            'class_type': 'SaveImage',
            'inputs': {'images': ['decode', 0], 'filename_prefix': 'ARELM'},
        },
    }


def 作る(プロンプト, 幅=1024, 高さ=1024, タイムアウト秒=600):
    """
    ComfyUI に絵を頼み、できたら画像の場所を返す。

    実測で1枚 約6分かかった（この端末・768x768・4ステップ）。
    大きな絵ほど、さらに時間がかかる。

    @return {'ok': bool, '訳': str, 'ファイル名': str, 'サブフォルダ': str} など
    """
    プロンプト = (プロンプト or '').strip()
    if not プロンプト:
        return {'ok': False, '訳': '何を描くかが要ります'}

    if not 使えるか():
        return {
            'ok': False,
            '訳': 'ComfyUI が動いていません。ComfyUI を起動してから、もう一度お試しください。',
        }

    種 = uuid.uuid4().int & ((1 << 32) - 1)
    グラフ = _グラフを組む(プロンプト, 幅, 高さ, 種)
    client_id = str(uuid.uuid4())

    try:
        本文 = json.dumps({'prompt': グラフ, 'client_id': client_id}).encode('utf-8')
        要求 = urllib.request.Request(
            f'{COMFYUI_の場所}/prompt', data=本文,
            headers={'Content-Type': 'application/json'}, method='POST')
        with urllib.request.urlopen(要求, timeout=15) as 応答:
            結果 = json.loads(応答.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        詳細 = e.read().decode('utf-8', errors='ignore')[:400]
        return {'ok': False, '訳': f'ComfyUIに断られました: {詳細}'}
    except (urllib.error.URLError, OSError, TimeoutError) as e:
        return {'ok': False, '訳': f'ComfyUIに繋がりませんでした: {e}'}

    prompt_id = 結果.get('prompt_id')
    if not prompt_id:
        return {'ok': False, '訳': f'ComfyUIから受け付けの番号が返りませんでした: {結果}'}

    # --- できるまで待つ ---
    #
    # 画像生成は数十秒〜数分かかる。少しずつ様子を見に行く。
    始め = time.time()
    while time.time() - 始め < タイムアウト秒:
        time.sleep(3)
        try:
            with urllib.request.urlopen(
                    f'{COMFYUI_の場所}/history/{prompt_id}', timeout=10) as 応答:
                履歴 = json.loads(応答.read().decode('utf-8'))
        except (urllib.error.URLError, OSError, TimeoutError):
            continue

        item = 履歴.get(prompt_id)
        if not item:
            continue

        状態 = (item.get('status') or {})
        if 状態.get('status_str') == 'error':
            return {'ok': False, '訳': f'ComfyUIでの生成に失敗しました: {状態}'}

        出力 = item.get('outputs') or {}
        画像たち = (出力.get('save') or {}).get('images') or []
        if 画像たち:
            画 = 画像たち[0]
            return {
                'ok': True,
                '訳': '絵ができました',
                'ファイル名': 画.get('filename'),
                'サブフォルダ': 画.get('subfolder', ''),
                '種類': 画.get('type', 'output'),
                'プロンプト': プロンプト,
            }

    return {
        'ok': False,
        '訳': f'{タイムアウト秒}秒待ちましたが、できませんでした。'
              'この端末では大きなモデルなので、時間がかかりすぎている可能性があります。',
    }


def 画像のURL(ファイル名, サブフォルダ='', 種類='output'):
    """ComfyUI から画像そのものを取ってくるための場所。"""
    from urllib.parse import urlencode
    クエリ = urlencode({'filename': ファイル名, 'subfolder': サブフォルダ, 'type': 種類})
    return f'{COMFYUI_の場所}/view?{クエリ}'


def _できるまで待つ(prompt_id, ノード名, タイムアウト秒):
    """/prompt を投げたあと、できるまで様子を見に行く共通処理。"""
    始め = time.time()
    while time.time() - 始め < タイムアウト秒:
        time.sleep(3)
        try:
            with urllib.request.urlopen(
                    f'{COMFYUI_の場所}/history/{prompt_id}', timeout=10) as 応答:
                履歴 = json.loads(応答.read().decode('utf-8'))
        except (urllib.error.URLError, OSError, TimeoutError):
            continue

        item = 履歴.get(prompt_id)
        if not item:
            continue

        状態 = (item.get('status') or {})
        if 状態.get('status_str') == 'error':
            return {'ok': False, '訳': f'ComfyUIでの生成に失敗しました: {状態}'}

        出力 = item.get('outputs') or {}
        画像たち = (出力.get(ノード名) or {}).get('images') or []
        if 画像たち:
            画 = 画像たち[0]
            return {
                'ok': True, '訳': 'できました',
                'ファイル名': 画.get('filename'),
                'サブフォルダ': 画.get('subfolder', ''),
                '種類': 画.get('type', 'output'),
            }

    return {
        'ok': False,
        '訳': f'{タイムアウト秒}秒待ちましたが、できませんでした。'
              'この端末では大きなモデルなので、時間がかかりすぎている可能性があります。',
    }


def _画像をアップロードする(ローカルパス):
    """
    手元の画像ファイルを ComfyUI へ送り、ComfyUI側での呼び名を受け取る。

    ここで送るのは、この端末の中の ComfyUI（127.0.0.1）だけ。
    外部には一切送らない。
    """
    import mimetypes
    import os
    import uuid as _uuid

    境界 = _uuid.uuid4().hex
    ファイル名 = os.path.basename(ローカルパス)
    種類 = mimetypes.guess_type(ファイル名)[0] or 'image/png'

    with open(ローカルパス, 'rb') as f:
        中身 = f.read()

    本文 = (
        f'--{境界}\r\n'
        f'Content-Disposition: form-data; name="image"; filename="{ファイル名}"\r\n'
        f'Content-Type: {種類}\r\n\r\n'
    ).encode('utf-8') + 中身 + f'\r\n--{境界}--\r\n'.encode('utf-8')

    要求 = urllib.request.Request(
        f'{COMFYUI_の場所}/upload/image', data=本文,
        headers={'Content-Type': f'multipart/form-data; boundary={境界}'},
        method='POST')
    with urllib.request.urlopen(要求, timeout=30) as 応答:
        結果 = json.loads(応答.read().decode('utf-8'))
    return 結果.get('name')


def 試着を作る(人物の写真, 服の画像, 指示='', 幅=1024, 高さ=1024, タイムアウト秒=600):
    """
    人物の写真に、服の画像を着せた絵を作る（AIバーチャル試着）。

    やり方:
        Flux.2 Klein の編集機能（ReferenceLatent）に、
        画像を2枚（人物・服）を続けて渡し、
        「1枚目の人物に、2枚目の服を着せて」と指示する。

    正直に書いておくこと:
        Flux.2 Klein は画像編集ができるモデルだが、
        試着専用に作られたモデルではない。
        うまく合わないことがある。そのときは正直にそう伝える。
    """
    if not 使えるか():
        return {'ok': False, '訳': 'ComfyUI が動いていません。'}

    try:
        人物ファイル = _画像をアップロードする(人物の写真)
        服ファイル = _画像をアップロードする(服の画像)
    except Exception as e:
        return {'ok': False, '訳': f'画像をComfyUIへ渡せませんでした: {e}'}

    文 = (指示 or '').strip() or (
        'Keep the person\'s face, pose and background exactly the same. '
        'Replace only their clothing with the garment shown in the second image. '
        'Make it look naturally worn, matching the lighting and body shape.'
    )
    種 = uuid.uuid4().int & ((1 << 32) - 1)

    グラフ = {
        'unet': {'class_type': 'UNETLoader',
                 'inputs': {'unet_name': UNET名, 'weight_dtype': 'default'}},
        'clip': {'class_type': 'CLIPLoader',
                 'inputs': {'clip_name': CLIP名, 'type': 'flux2', 'device': 'default'}},
        'vae': {'class_type': 'VAELoader', 'inputs': {'vae_name': VAE名}},

        'load_person': {'class_type': 'LoadImage', 'inputs': {'image': 人物ファイル}},
        'load_garment': {'class_type': 'LoadImage', 'inputs': {'image': 服ファイル}},

        'size_person': {'class_type': 'ImageScaleToTotalPixels',
                         'inputs': {'image': ['load_person', 0], 'upscale_method': 'nearest-exact',
                                    'megapixels': 1, 'resolution_steps': 1}},
        'size_garment': {'class_type': 'ImageScaleToTotalPixels',
                          'inputs': {'image': ['load_garment', 0], 'upscale_method': 'nearest-exact',
                                     'megapixels': 1, 'resolution_steps': 1}},
        'wh': {'class_type': 'GetImageSize', 'inputs': {'image': ['size_person', 0]}},

        'enc_person': {'class_type': 'VAEEncode',
                        'inputs': {'pixels': ['size_person', 0], 'vae': ['vae', 0]}},
        'enc_garment': {'class_type': 'VAEEncode',
                         'inputs': {'pixels': ['size_garment', 0], 'vae': ['vae', 0]}},

        'text': {'class_type': 'CLIPTextEncode', 'inputs': {'clip': ['clip', 0], 'text': 文}},
        'neg_zero': {'class_type': 'ConditioningZeroOut',
                      'inputs': {'conditioning': ['text', 0]}},

        # 1枚目（人物）を参照に加える
        'pos_ref1': {'class_type': 'ReferenceLatent',
                      'inputs': {'conditioning': ['text', 0], 'latent': ['enc_person', 0]}},
        'neg_ref1': {'class_type': 'ReferenceLatent',
                      'inputs': {'conditioning': ['neg_zero', 0], 'latent': ['enc_person', 0]}},
        # 2枚目（服）を続けて参照に加える
        'pos_ref2': {'class_type': 'ReferenceLatent',
                      'inputs': {'conditioning': ['pos_ref1', 0], 'latent': ['enc_garment', 0]}},
        'neg_ref2': {'class_type': 'ReferenceLatent',
                      'inputs': {'conditioning': ['neg_ref1', 0], 'latent': ['enc_garment', 0]}},

        'guider': {'class_type': 'CFGGuider',
                   'inputs': {'model': ['unet', 0], 'positive': ['pos_ref2', 0],
                              'negative': ['neg_ref2', 0], 'cfg': 1}},
        'sampler_sel': {'class_type': 'KSamplerSelect', 'inputs': {'sampler_name': 'euler'}},
        'noise': {'class_type': 'RandomNoise', 'inputs': {'noise_seed': 種}},
        'latent': {'class_type': 'EmptyFlux2LatentImage',
                   'inputs': {'width': ['wh', 0], 'height': ['wh', 1], 'batch_size': 1}},
        'sigmas': {'class_type': 'Flux2Scheduler',
                   'inputs': {'steps': 4, 'width': ['wh', 0], 'height': ['wh', 1]}},
        'sample': {'class_type': 'SamplerCustomAdvanced',
                   'inputs': {'noise': ['noise', 0], 'guider': ['guider', 0],
                              'sampler': ['sampler_sel', 0], 'sigmas': ['sigmas', 0],
                              'latent_image': ['latent', 0]}},
        'decode': {'class_type': 'VAEDecode',
                   'inputs': {'samples': ['sample', 0], 'vae': ['vae', 0]}},
        'save': {'class_type': 'SaveImage',
                 'inputs': {'images': ['decode', 0], 'filename_prefix': 'AReGLM_試着'}},
    }

    try:
        本文 = json.dumps({'prompt': グラフ, 'client_id': str(uuid.uuid4())}).encode('utf-8')
        要求 = urllib.request.Request(
            f'{COMFYUI_の場所}/prompt', data=本文,
            headers={'Content-Type': 'application/json'}, method='POST')
        with urllib.request.urlopen(要求, timeout=15) as 応答:
            結果 = json.loads(応答.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return {'ok': False, '訳': f'ComfyUIに断られました: {e.read().decode("utf-8", "ignore")[:400]}'}
    except (urllib.error.URLError, OSError, TimeoutError) as e:
        return {'ok': False, '訳': f'ComfyUIに繋がりませんでした: {e}'}

    prompt_id = 結果.get('prompt_id')
    if not prompt_id:
        return {'ok': False, '訳': f'受け付けの番号が返りませんでした: {結果}'}

    return _できるまで待つ(prompt_id, 'save', タイムアウト秒)
