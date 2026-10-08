from PIL import Image, ImageDraw, ImageFilter, ImageChops
import numpy as np, os, shutil, sys
N=1024
a = np.array(Image.open(sys.argv[1]).convert('RGB')).astype(int)
def 近い(c,t=40): return (abs(a[:,:,0]-c[0])<=t)&(abs(a[:,:,1]-c[1])<=t)&(abs(a[:,:,2]-c[2])<=t)
線色=(224,242,254)
# 1) 白い線（ごく薄い水色）の画素だけを取り出す。2段目の空色(147,197,253)とは、赤みで見分ける
線 = (a[:,:,0] > 195) & (a[:,:,1] > 220) & (a[:,:,2] > 235)
L = Image.fromarray((線*255).astype('uint8'))
def 閉じる(img, n): return img.filter(ImageFilter.MaxFilter(n)).filter(ImageFilter.MinFilter(n))
# 2) 服の外形: 重く閉じて、外側から塗って、届かない所を服の形とする
重 = 閉じる(L, 15)
枠 = Image.new('L',(N+4,N+4),0); 枠.paste(重,(2,2)); ImageDraw.floodfill(枠,(0,0),128)
形 = Image.fromarray(((np.array(枠)[2:-2,2:-2] != 128)*255).astype('uint8'))
形 = 形.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))          # 細いひげ・かけらを落とす
# 3) 外形の輪郭を、途切れのない線として引く（太さは、元の外側の線とそろえる）
太さ = 11
外周 = ImageChops.subtract(形, 形.filter(ImageFilter.MinFilter(太さ)))
# 4) 中の模様の線: 元の線の切れ目だけを、軽く閉じて埋める。外形の中だけ
内側 = 形.filter(ImageFilter.MinFilter(太さ+2))
中の線 = ImageChops.multiply(L, 内側)
線全体 = ImageChops.lighter(外周, 中の線)
# 5) 重ね直し: 背景 → 枠 → 2段目 → 服の黒 → 3段目 → 線
yy,xx = np.mgrid[0:N,0:N]; 距離 = abs(xx-512)+abs(yy-512)
色 = {'背景':(7,11,22),'枠':(37,99,235),'二段目':(147,197,253),'服':(0,0,0),'線':線色,'三段目':(14,165,233)}
out = np.zeros((N,N,3),float); out[:]=色['背景']
out[距離<=470]=色['枠']; out[距離<=360]=色['二段目']
def 重ねる(out, 色c, 形マスク, ぼかし=0.9):
    m = np.array(形マスク.filter(ImageFilter.GaussianBlur(ぼかし))).astype(float)/255
    return out*(1-m[:,:,None]) + np.array(色c,float)*m[:,:,None]
out = 重ねる(out, 色['服'], 形)
三 = Image.fromarray((((abs(xx-510)+abs(yy-495))<=52)*255).astype('uint8'))
out = 重ねる(out, 色['三段目'], ImageChops.multiply(三, 形.filter(ImageFilter.MinFilter(5))), 0.6)
out = 重ねる(out, 色['線'], 線全体)
art = Image.fromarray(out.round().astype('uint8'))
art.save(sys.argv[2])
# 検証: 服の外へ出た黒い点（外形の外の、黒）がないか
b = np.array(art).astype(int); 黒 = (b.sum(axis=2) < 12)
外へ = 黒 & ~(np.array(形.filter(ImageFilter.MaxFilter(9)))>0)
print('外形の外へはみ出した黒い点:', int(外へ.sum()), ' / 外周の太さ', 太さ, ' / 外形の面積', int((np.array(形)>0).sum()))
