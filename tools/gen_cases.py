# 事例ライブラリのページを data/cases.json から作る。
#   python3 tools/gen_cases.py          ページを書き出す
#   python3 tools/gen_cases.py --check  出典・表現のチェックだけ行う（PRの自動チェック用）
# 事例は、公開されている判決・行政の公表に基づく。書く事実は出典に書かれている範囲に限る。
import html, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = json.load(open(os.path.join(ROOT, "data", "cases.json"), encoding="utf-8"))
CASES = DATA["cases"]
E = html.escape

# ---- チェック（マーケエージェントの guard と同じ考え方の最小版） ----
BANNED = ["紹介料", "紹介手数料", "あっせん料", "斡旋料", "必ず勝て", "絶対に勝", "100%勝", "確実に取り戻"]
NAME_RE = re.compile(r"([一-龥]{2,4})(?:氏|容疑者|被告人?|受刑者|さん)")
NOT_NAME = ("男性", "女性", "男", "女", "同", "元", "両", "当", "各", "代表", "社長", "店長", "少年", "少女")
REQUIRED = ["id", "genre", "title", "court", "kind", "points", "lesson", "details", "sources"]


def check():
    errs, ids = [], set()
    for c in CASES:
        cid = c.get("id", "?")
        for k in REQUIRED:
            if not c.get(k):
                errs.append(f"事例{cid}: {k} が空です")
        if cid in ids:
            errs.append(f"事例{cid}: id が重複しています")
        ids.add(cid)
        for s in c.get("sources", []):
            if not str(s.get("url", "")).startswith("https://"):
                errs.append(f"事例{cid}: 出典URLは https で始めてください")
        text = json.dumps(c, ensure_ascii=False)
        for w in BANNED:
            if w in text:
                errs.append(f"事例{cid}: 使えない表現「{w}」があります")
        for m in NAME_RE.finditer(text):
            if m.group(1).endswith(NOT_NAME) or m.group(1) in NOT_NAME:
                continue
            errs.append(f"事例{cid}: 個人名の可能性「{m.group(0)}」。名前は出さないでください")
    for t in DATA.get("top", []):
        if t not in ids:
            errs.append(f"top に存在しない事例 {t} があります")
    return errs


# ---- ページ作成 ----
def asset_ver():
    m = re.search(r'style\.css\?v=([a-z0-9]+)', open(os.path.join(ROOT, "index.html"), encoding="utf-8").read())
    return m.group(1) if m else "1"


GROUP, MAIL, VER = E(DATA["group_name"]), E(DATA["contact_email"]), asset_ver()
HEAD = '''<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'">
<meta name="referrer" content="no-referrer">
<title>{title}｜''' + GROUP + '''</title>
<link rel="stylesheet" href="../style.css?v=''' + VER + '''">
</head>
<body>
'''
FOOT = f'''<footer class="site-footer">
  <p>{GROUP}（任意団体）　<a href="../terms.html">利用規約</a>　<a href="../privacy.html">情報の取扱いについて</a></p>
  <p>お問い合わせ・削除のご依頼：{MAIL}</p>
</footer>
</body>
</html>
'''
HELP = '''  <aside class="help-box">
    <h2>ひとりで悩まないでください</h2>
    <ul>
      <li><strong>#8891</strong>（はやくワンストップ）：性犯罪・性暴力被害者のためのワンストップ支援センター。最寄りの窓口につながります。</li>
      <li><strong>#8103</strong>（ハートさん）：警察の性犯罪被害相談電話。</li>
      <li><a href="https://www.no-harassment.mhlw.go.jp/" target="_blank" rel="noopener">あかるい職場応援団（厚生労働省）</a>：職場のハラスメントの相談先。</li>
    </ul>
  </aside>
'''


def thumb(c):
    return (f'<div class="thumb {c["tone"]}"><span class="th-genre">{c["icon"]} {E(c["genre"])}</span>'
            f'<span class="th-cat">{E(c["thumb"])}</span><span class="th-num">{E(c["num"])}</span>'
            f'<span class="th-status">{E(c["status"])}</span></div>')


def card(c, base):
    return (f'<a class="card case-card" href="{base}{c["id"]}.html">{thumb(c)}'
            f'<h3>{E(c["title"])}</h3><p class="meta">{E(c["court"])}</p></a>')


def page(c):
    b = [HEAD.format(title=E(c["title"]))]
    b.append('<main class="doc case">\n  <p class="hint"><a href="../index.html">← トップへ</a>　<a href="index.html">事例ライブラリ</a></p>\n')
    b.append(f'  <p class="case-kind">{E(c["kind"])}｜{E(c["genre"])}</p>\n  <h1>{E(c["title"])}</h1>\n  <p class="hint">{E(c["court"])}</p>\n')
    b.append('  ' + thumb(c) + '\n')
    b.append('  <h2>1分でわかる要約</h2>\n  <ul class="points">\n' + ''.join(f'    <li>{E(p)}</li>\n' for p in c["points"]) + '  </ul>\n')
    b.append(f'  <p class="lesson">💡 {E(c["lesson"])}</p>\n')
    b.append('  <details class="more">\n    <summary>詳細を読む</summary>\n    <div class="detail">\n' + ''.join(f'      <p>{E(d)}</p>\n' for d in c["details"]))
    b.append('      <p class="hint">出典：' + '、'.join(f'<a href="{E(s["url"])}" target="_blank" rel="noopener">{E(s["name"])}</a>' for s in c["sources"]) + '</p>\n')
    b.append('      <p class="hint">当事者の名前は出していません。要約は当団体が出典をもとに作成したもので、法的な助言ではありません。</p>\n    </div>\n  </details>\n')
    if c.get("help"):
        b.append(HELP)
    b.append('  <p class="cta"><a class="cta-btn" href="../index.html#intake">同じようなことで困っている方はこちら</a></p>\n</main>\n')
    b.append(FOOT)
    return ''.join(b)


def write(rel, s):
    with open(os.path.join(ROOT, rel), "w", encoding="utf-8") as f:
        f.write(s)


def build():
    os.makedirs(os.path.join(ROOT, "cases"), exist_ok=True)
    for c in CASES:
        write(f'cases/{c["id"]}.html', page(c))
    lib = [HEAD.format(title="事例ライブラリ"),
           '<main class="doc">\n  <p class="hint"><a href="../index.html">← トップへ</a></p>\n  <h1>事例ライブラリ</h1>\n'
           '  <p class="hint">国や報道で公開されている判決・行政の勧告を、1分で読めるようにまとめています。事例は順次追加します。</p>\n  <div class="case-grid">\n']
    lib += ['    ' + card(c, "") + '\n' for c in CASES]
    lib.append('  </div>\n</main>\n' + FOOT)
    write('cases/index.html', ''.join(lib))
    # トップページの事例カード（目印の間を置きかえる）
    p = os.path.join(ROOT, 'index.html')
    s = open(p, encoding='utf-8').read()
    a, z = '<!-- CASES:START -->', '<!-- CASES:END -->'
    byid = {c["id"]: c for c in CASES}
    if a in s and z in s:
        block = a + '\n' + ''.join('      ' + card(byid[i], "cases/") + '\n' for i in DATA["top"]) + '      ' + z
        s = s[:s.index(a)] + block + s[s.index(z) + len(z):]
        write('index.html', s)


if __name__ == "__main__":
    errs = check()
    if errs:
        print("\n".join(errs))
        sys.exit(1)
    if "--check" in sys.argv:
        print(f"OK: {len(CASES)}件")
    else:
        build()
        print(f"ページを作成しました: {len(CASES)}件")
