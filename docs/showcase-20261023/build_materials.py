"""Build publication PDFs and figures from versioned, auditable sources.

Run with Python (ReportLab 4.2.5+, matplotlib, Pillow and pypdf).
"""
from pathlib import Path
import csv
import json
import math
import re
import shutil
import sys
from html import escape

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
from PIL import Image as PILImage
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, Table, TableStyle, Flowable, Image
from pypdf import PdfReader

sys.path.insert(0, str(Path(__file__).parent))
from content import TITLE, VERSION, GUIDE, OVERVIEW, PAPER

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output' / 'showcase-20261023'
FIG = OUT / 'figures'
PDF = ROOT / 'output' / 'pdf'
SOURCE = Path(__file__).parent
for folder in (OUT, FIG, PDF): folder.mkdir(parents=True, exist_ok=True)
PURPLE = '#6E45A8'
DARK = '#2F2442'
MUTED = '#655C72'
LIGHT = '#F3EFF9'
LINE = '#DFD6EB'
font_file = 'C:/Windows/Fonts/msyh.ttc'
font_bold = 'C:/Windows/Fonts/msyhbd.ttc'
pdfmetrics.registerFont(TTFont('CN', font_file))
pdfmetrics.registerFont(TTFont('CN-Bold', font_bold))
pdfmetrics.registerFontFamily('CN', normal='CN', bold='CN-Bold', italic='CN', boldItalic='CN-Bold')
fp = font_manager.FontProperties(fname=font_file)
plt.rcParams.update({'font.family': fp.get_name(), 'axes.unicode_minus': False,
                     'font.size': 12, 'axes.spines.top': False, 'axes.spines.right': False,
                     'axes.edgecolor': LINE, 'text.color': DARK, 'axes.labelcolor': MUTED,
                     'xtick.color': MUTED, 'ytick.color': MUTED, 'figure.facecolor': 'white',
                     'axes.facecolor': 'white', 'savefig.facecolor': 'white'})
font_manager.fontManager.addfont(font_file)


def savefig(fig, name):
    fig.savefig(FIG / (name + '.png'), dpi=250, bbox_inches='tight', pad_inches=.16)
    fig.savefig(FIG / (name + '.pdf'), bbox_inches='tight', pad_inches=.16)
    plt.close(fig)


def box(ax, x, y, w, h, text, strong=False, size=14):
    ax.add_patch(FancyBboxPatch((x,y),w,h,boxstyle='round,pad=0.014,rounding_size=.03',
                 facecolor=PURPLE if strong else LIGHT, edgecolor=PURPLE if strong else LINE, linewidth=1))
    ax.text(x+w/2, y+h/2, text, ha='center', va='center', fontsize=size,
            color='white' if strong else DARK, linespacing=1.7, fontproperties=fp)


def arrow(ax, a, b):
    ax.add_patch(FancyArrowPatch(a,b,arrowstyle='-|>',mutation_scale=13,color=PURPLE,linewidth=1.5))


def figures():
    fig, ax = plt.subplots(figsize=(8,4.6)); ax.set(xlim=(0,1),ylim=(0,1));ax.axis('off')
    box(ax,.02,.66,.26,.25,'三维控制台\nReact · Three.js')
    box(ax,.37,.66,.26,.25,'MQTT / WebSocket\n指令 · 快照 · 回执')
    box(ax,.72,.66,.26,.25,'Python 后端\n订单 · 设备 · 时间',True)
    arrow(ax,(.28,.785),(.37,.785));arrow(ax,(.63,.785),(.72,.785))
    box(ax,.02,.12,.26,.29,'大模型入口\n自然语言 → 约束\n不直接控制飞行')
    box(ax,.37,.12,.26,.29,'PPO / ONNX\n选择接应点与订单\n波次边界规划',True)
    box(ax,.72,.12,.26,.29,'执行状态机\n取件 · 回收 · 补能\n实际指标累计')
    arrow(ax,(.85,.66),(.85,.41));arrow(ax,(.72,.26),(.63,.26));arrow(ax,(.28,.26),(.37,.26))
    ax.text(.5,.51,'后端维护唯一业务状态；前端负责交互与展示',ha='center',fontsize=14,fontproperties=fp,color=MUTED)
    savefig(fig,'architecture')

    fig,ax=plt.subplots(figsize=(7.2,4.5));ax.set(xlim=(0,1),ylim=(0,1));ax.axis('off')
    labels=['母车静止补能','起飞与前往','稳定悬停取件','回收与归位','单舱排队卸货','携货返航']
    pts=[(.02,.65),(.36,.65),(.70,.65),(.02,.19),(.36,.19),(.70,.19)]
    for i,((x,y),label) in enumerate(zip(pts,labels)):box(ax,x,y,.28,.2,label,i in (0,4),14)
    arrow(ax,(.30,.75),(.36,.75));arrow(ax,(.64,.75),(.70,.75));arrow(ax,(.84,.65),(.84,.39))
    arrow(ax,(.70,.29),(.64,.29));arrow(ax,(.36,.29),(.30,.29))
    ax.text(.5,.5,'母车同时驶向接应点；卸货前必须已到位',ha='center',fontsize=14,fontproperties=fp,color=MUTED)
    ax.text(.5,.06,'全部归位并关舱 → 下一波；暂停 / 急停冻结任务',ha='center',fontsize=13,fontproperties=fp,color=MUTED)
    savefig(fig,'state-machine')

    fig,ax=plt.subplots(figsize=(7.2,4.8));ax.set(xlim=(0,1),ylim=(0,1));ax.axis('off')
    box(ax,.02,.7,.27,.21,'订单 18×8\nMLP 8→32→32',size=14)
    box(ax,.37,.7,.27,.21,'均值 + 最大池化\n集合摘要 64 维',size=14)
    box(ax,.72,.7,.26,.21,'全局特征 36 维',size=14)
    arrow(ax,(.29,.8),(.37,.8))
    box(ax,.37,.38,.27,.20,'上下文网络\n100→96',True,size=14)
    arrow(ax,(.50,.70),(.50,.58));arrow(ax,(.85,.70),(.64,.49))
    box(ax,.02,.04,.43,.19,'Actor：上下文 + 候选 16 维\n112→64→1 + 合法动作掩码',size=14)
    box(ax,.59,.04,.39,.19,'Critic：状态价值\n96→64→1',size=14)
    arrow(ax,(.42,.38),(.24,.23));arrow(ax,(.59,.38),(.78,.23))
    savefig(fig,'network')

    summary=json.loads((ROOT/'experiments/dispatch_v2/results/summary.json').read_text(encoding='utf-8'))
    fig,ax=plt.subplots(figsize=(6.7,4.3))
    for seed,color in [(7,PURPLE),(42,'#AB83C7')]:
        with (ROOT/f'experiments/dispatch_v2/runs/ppo_wave_sync_seed{seed}/learning.csv').open() as f:
            rows=list(csv.DictReader(f))
        ax.plot([int(x['iteration']) for x in rows],[float(x['objective']) for x in rows],label=f'Seed {seed}',color=color,lw=1.8)
    ax.axhline(142.391,color='#ABA4B3',lw=.8,ls='--')
    ax.set(xlabel='PPO 更新次数',ylabel='固定验证集综合目标 J',title='两组独立训练的验证曲线（64 场景）')
    ax.grid(axis='y',alpha=.2);ax.legend(frameon=False);fig.tight_layout();savefig(fig,'learning')

    methods=summary['methods']; base=methods['cost_centroid'];ppo=methods['ppo']
    keys=['mean_latency_s','energy_per_order_wh','objective']
    labels=['平均时延','每单能耗','综合目标']
    vals=[ppo[k]/base[k]*100 for k in keys]
    fig,ax=plt.subplots(figsize=(6.5,3.9))
    x=range(3);ax.bar(x,[100]*3,width=.64,color=LIGHT,label='强规则基线')
    ax.bar(x,vals,width=.36,color=PURPLE,label='PPO')
    for i,v in enumerate(vals):ax.text(i,v+.15,f'{v:.2f}',ha='center',fontsize=12)
    ax.set(xticks=list(x),xticklabels=labels,ylim=(94,102),ylabel='成本指数：基线 = 100',title='512 个独立静态场景，越低越好')
    ax.grid(axis='y',alpha=.18)
    ax.legend(frameon=False,loc='upper center',bbox_to_anchor=(.5,-.16),ncol=2)
    fig.tight_layout();savefig(fig,'comparison')

    fig,ax=plt.subplots(figsize=(6.7,4.1))
    names=['全学习','规则母车 + 学习选单','学习母车 + 规则选单']
    v=[methods[k]['objective'] for k in ['ppo','rule_mother','rule_orders']]
    ax.barh(names,v,color=[PURPLE,'#C7B6DF','#9A79BD'],height=.55)
    for i,n in enumerate(v):ax.text(n+.03,i,f'{n:.3f}',va='center',fontsize=12)
    ax.set(xlim=(134,142),xlabel='综合目标 J（越低越好）',title='冻结策略后的动作替换消融')
    ax.invert_yaxis();ax.grid(axis='x',alpha=.17);fig.tight_layout();savefig(fig,'ablation')
    shutil.copy2(ROOT/'frontend/output/v2-integration/ai-dispatch-verified.jpg',FIG/'ai-dispatch-verified.jpg')


def style(size, kind='body'):
    return ParagraphStyle('body',fontName='CN-Bold' if kind in ('heading','tablehead') else 'CN',
            fontSize=size,leading=size*1.62,textColor=colors.HexColor(PURPLE if kind=='heading' else DARK),
            wordWrap='CJK',spaceAfter=0,allowWidows=0,allowOrphans=0)


def para(text,size,kind='body'):
    # Enable natural English wrapping at slashes in long source paths.
    text=escape(text.replace('–','-').replace('—','-').replace('−','-')).replace('\n','<br/>')
    superscript=str.maketrans('⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺','0123456789-+')
    text=re.sub('[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+',lambda m:'<super>'+m.group().translate(superscript)+'</super>',text)
    for original,replacement in [('ᵢ','<sub>i</sub>'),('₁','<sub>1</sub>'),
                                 ('₂','<sub>2</sub>'),('₃','<sub>3</sub>')]:
        text=text.replace(original,replacement)
    return Paragraph(text,style(size,kind))


class Callout(Flowable):
    def __init__(self,text,width,size,code=False):
        Flowable.__init__(self);self.width=width;self.p=para(text,size)
        self.pad=10;self.ph=self.p.wrap(width-20,10000)[1];self.height=self.ph+20
    def draw(self):
        c=self.canv;c.setFillColor(colors.HexColor(LIGHT));c.setStrokeColor(colors.HexColor(LINE))
        c.roundRect(0,0,self.width,self.height,5,stroke=0,fill=1)
        c.setFillColor(colors.HexColor(PURPLE));c.rect(0,0,2.5,self.height,stroke=0,fill=1)
        self.p.drawOn(c,10,10)


class ScreenshotCrop(Flowable):
    """Clip only within PDF layout; the source screenshot remains unchanged."""
    def __init__(self,path,width,maxh):
        self.path=str(path);self.width=width;self.height=min(maxh,width*235/280)
    def draw(self):
        c=self.canv;c.saveState()
        p=c.beginPath();p.rect(0,0,self.width,self.height);c.clipPath(p,stroke=0)
        # Existing 933×1188 screenshot: crop right-hand natural language receipt.
        sx,sy,sw,sh=650,375,280,235
        scale=min(self.width/sw,self.height/sh)
        c.drawImage(self.path,-sx*scale,-(1188-sy-sh)*scale,width=933*scale,height=1188*scale)
        c.restoreState()


def flow(block,width,size):
    kind=block[0]
    if kind=='h':return para(block[1],size*1.19,'heading'),9,5
    if kind=='p':return para(block[1],size),0,size*.65
    if kind in ('box','code'):return Callout(block[1],width,size*.97),5,9
    if kind=='table':
        headers,rows,ratios=block[1:]
        if ratios is None:ratios=[1/len(headers)]*len(headers)
        data=[[para(v,size*.94,'tablehead') for v in headers]]+[[para(v,size*.94) for v in r] for r in rows]
        t=Table(data,colWidths=[width*r for r in ratios],hAlign='LEFT')
        t.setStyle(TableStyle([
            ('BACKGROUND',(0,0),(-1,0),colors.HexColor(LIGHT)),
            ('LINEBELOW',(0,0),(-1,0),.7,colors.HexColor(PURPLE)),
            ('LINEBELOW',(0,1),(-1,-1),.35,colors.HexColor(LINE)),
            ('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),6),
            ('RIGHTPADDING',(0,0),(-1,-1),6),('TOPPADDING',(0,0),(-1,-1),6),
            ('BOTTOMPADDING',(0,0),(-1,-1),6),
        ]))
        return t,5,10
    if kind=='fig':
        name,caption,maxh=block[1:]
        path=FIG/name
        if name.endswith('.jpg'):
            pic=ScreenshotCrop(path,width,maxh)
        else:
            iw,ih=PILImage.open(path).size
            ratio=min(width/iw,maxh/ih)
            pic=Image(str(path),width=iw*ratio,height=ih*ratio)
            pic.width,pic.height=pic.drawWidth,pic.drawHeight
        return FigureWithCaption(pic,caption,width,size*.88),4,8
    raise ValueError(kind)


class FigureWithCaption(Flowable):
    def __init__(self,pic,caption,width,size):
        Flowable.__init__(self);self.pic=pic;self.p=para(caption,size);self.width=width
        self.ph=self.p.wrap(width,10000)[1];self.height=pic.height+6+self.ph
    def draw(self):
        self.pic.drawOn(self.canv,(self.width-self.pic.width)/2,self.ph+6)
        self.p.drawOn(self.canv,0,0)


def measure(blocks,width,size):
    items=[];total=0
    for b in blocks:
        obj,before,after=flow(b,width,size)
        h=obj.wrap(width,10000)[1]
        total+=h+before+after
        items.append((obj,h,before,after))
    return total,items


def draw_blocks(c,blocks,x,y,width,height,size,min_size):
    while True:
        total,items=measure(blocks,width,size)
        if total<=height:break
        size-=.15
        if size<min_size:raise ValueError(f'Column overflow: {total:.1f}>{height:.1f}, min font {min_size}')
    for obj,h,before,after in items:
        y-=before+h;obj.drawOn(c,x,y);y-=after
    return size,total


def furniture(c,short,page,total):
    w,h=A4;c.setStrokeColor(colors.HexColor(LINE));c.setLineWidth(.5)
    c.line(42,h-37,w-42,h-37);c.line(42,35,w-42,35)
    c.setFont('CN',8);c.setFillColor(colors.HexColor(MUTED))
    c.drawString(42,h-28,'NEXUS / V2  园区空地协同取件')
    c.drawRightString(w-42,h-28,short)
    c.drawString(42,22,'基于 f3b5bc9  |  2026-10-23  |  仿真原型')
    c.drawRightString(w-42,22,f'{page:02d} / {total:02d}')


def build_single(pages,name,short,subtitle):
    path=PDF/name;c=canvas.Canvas(str(path),pagesize=A4)
    c.setTitle(TITLE+' - '+short);c.setAuthor('陈远、王维 / 项目材料整理')
    sizes=[]
    for i,(title,blocks) in enumerate(pages,1):
        furniture(c,short,i,len(pages));y=A4[1]-63
        if i==1:
            c.setFont('CN-Bold',23);c.setFillColor(colors.HexColor(PURPLE));c.drawString(43,y,TITLE)
            y-=27;c.setFont('CN',10);c.setFillColor(colors.HexColor(MUTED));c.drawString(43,y,subtitle)
            y-=32
        c.setFillColor(colors.HexColor(DARK));c.setFont('CN-Bold',17);c.drawString(43,y,f'{i:02d}  {title}');y-=22
        size,used=draw_blocks(c,blocks,43,y,A4[0]-86,y-49,10.5,8.7)
        sizes.append(round(size,2));c.showPage()
    c.save();return path,sizes


def build_paper():
    path=PDF/'04_系统技术文档_双栏.pdf';c=canvas.Canvas(str(path),pagesize=A4)
    c.setTitle(TITLE+'：建模、算法与评估');c.setAuthor('陈远、王维')
    w,h=A4;gap=22;cw=(w-86-gap)/2;sizes=[]
    for i,(title,cols) in enumerate(PAPER,1):
        furniture(c,'系统技术文档 / 双栏',i,len(PAPER));y=h-62
        if i==1:
            c.setFillColor(colors.HexColor(PURPLE));c.setFont('CN-Bold',21);c.drawString(43,y,TITLE)
            y-=25;c.setFont('CN',12);c.setFillColor(colors.HexColor(DARK));c.drawString(43,y,'基于集中式 PPO 的调度、执行与三维仿真')
            y-=19;c.setFont('CN',9);c.setFillColor(colors.HexColor(MUTED));c.drawString(43,y,'陈远、王维  |  技术整理 2026-10-23  |  当前代码 f3b5bc9')
            abstract='摘要：面向一辆移动母车与三架无人机的园区取件，系统以共享 PPO 选择接应点与订单，由后端状态机执行回收，并接入动态订单与自然语言约束。512 个静态测试场景中，相对强规则平均时延降低 1.72%、每单能耗降低 2.29%；动态业务已完成 30 单整轮验证。本文分别报告算法效果、工程证据与适用边界。'
            p=para(abstract,9);ph=p.wrap(w-86,1000)[1];p.drawOn(c,43,y-11-ph);y-=ph+25
        c.setFillColor(colors.HexColor(DARK));c.setFont('CN-Bold',14);c.drawString(43,y,title);y-=20
        c.setStrokeColor(colors.HexColor(LINE));c.line(w/2,49,w/2,y)
        for j,blocks in enumerate(cols):
            size,used=draw_blocks(c,blocks,43+j*(cw+gap),y,cw,y-49,9.15,8.1)
            sizes.append({'page':i,'column':j+1,'font':round(size,2),'used':round(used,1)})
        c.showPage()
    c.save();return path,sizes


def md(blocks):
    out=[]
    for b in blocks:
        if b[0]=='h':out.append('### '+b[1])
        elif b[0]=='p':out.append(b[1])
        elif b[0]=='box':out.append('> '+b[1].replace('\n','\n> '))
        elif b[0]=='code':out.append('```text\n'+b[1]+'\n```')
        elif b[0]=='table':
            out.append('| '+' | '.join(b[1])+' |\n| '+' | '.join(['---']*len(b[1]))+' |\n'+
                '\n'.join('| '+' | '.join(x.replace('\n','<br>') for x in r)+' |' for r in b[2]))
        elif b[0]=='fig':out.append(f'![{b[2]}](../../output/showcase-20261023/figures/{b[1]})\n\n{b[2]}')
    return '\n\n'.join(out)


def main():
    figures()
    result=[]
    for pages,name,short,sub,source in [
        (GUIDE,'01_录屏操作与旁白脚本.pdf','录屏操作与旁白','约 5 分钟主视频 + 动态 30 单完整素材','01_录屏操作与旁白脚本.md'),
        (OVERVIEW,'02_系统说明与价值评估.pdf','系统说明与价值评估','背景与痛点 / 解决方案 / 可行性 / 价值与边界','02_系统说明与价值评估.md'),
    ]:
        path,sizes=build_single(pages,name,short,sub);result.append({'file':str(path),'font_sizes':sizes})
        (SOURCE/source).write_text('# '+TITLE+'\n\n'+VERSION+'\n\n'+'\n\n'.join('## '+t+'\n\n'+md(b) for t,b in pages),encoding='utf-8')
    path,sizes=build_paper();result.append({'file':str(path),'columns':sizes})
    (SOURCE/'04_系统技术文档.md').write_text('# '+TITLE+'：建模、算法与评估\n\n'+VERSION+'\n\n'+
        '\n\n'.join('## '+t+'\n\n'+md(cols[0]+cols[1]) for t,cols in PAPER),encoding='utf-8')
    for item in result:
        r=PdfReader(item['file']);item['pages']=len(r.pages)
        item['characters']=sum(len(p.extract_text() or '') for p in r.pages)
        if item['characters']<1000:raise ValueError('PDF text extraction failed')
    (OUT/'build_manifest.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False,indent=2))


if __name__=='__main__':main()
