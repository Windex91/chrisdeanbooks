"""Sync canonical root static files to the Cloudflare Pages public folder."""
from pathlib import Path
from shutil import copy2
root=Path(__file__).resolve().parent
out=root/'public'
roots=['assets','books','coming-soon','about','shop','contact','policies','success','cancel']
for name in roots:
    folder=root/name
    if not folder.exists():continue
    for src in folder.rglob('*'):
        if src.is_file():
            target=out/src.relative_to(root)
            target.parent.mkdir(parents=True,exist_ok=True)
            copy2(src,target)
for name in ['index.html','404.html','robots.txt','sitemap.xml','_headers','_redirects']:
    src=root/name
    if src.exists():copy2(src,out/name)
print('Static frontend copied to public/')
