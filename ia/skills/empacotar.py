"""Gera o .zip da skill para enviar no claude.ai (Configurações › Capacidades › Skills).

Uso: python ia/skills/empacotar.py [nome-da-skill]   (padrão: analista-cfo-horizon)
Confere o cabeçalho do SKILL.md (name/description) antes de empacotar.
"""
import pathlib
import re
import sys
import zipfile

AQUI = pathlib.Path(__file__).resolve().parent
nome = sys.argv[1] if len(sys.argv) > 1 else 'analista-cfo-horizon'
pasta = AQUI / nome
skill = (pasta / 'SKILL.md').read_text(encoding='utf-8')

cab = re.match(r'^---\n(.*?)\n---\n', skill, re.S)
if not cab:
    sys.exit('SKILL.md sem cabeçalho YAML (--- ... ---).')
campos = dict(re.findall(r'^(\w+):\s*(.+)$', cab.group(1), re.M))
if campos.get('name') != nome or not re.fullmatch(r'[a-z0-9-]{1,64}', campos.get('name', '')):
    sys.exit(f'name inválido: {campos.get("name")!r} (minúsculas, números e hífen; igual ao nome da pasta).')
if not campos.get('description') or len(campos['description']) > 1024:
    sys.exit('description vazia ou com mais de 1024 caracteres.')

destino = AQUI / f'{nome}.zip'
with zipfile.ZipFile(destino, 'w', zipfile.ZIP_DEFLATED) as z:
    for arq in sorted(pasta.rglob('*')):
        if arq.is_file():
            z.write(arq, arq.relative_to(AQUI).as_posix())
print(f'{destino}  ({len(campos["description"])} caracteres na description)')
for n in zipfile.ZipFile(destino).namelist():
    print('  ', n)
