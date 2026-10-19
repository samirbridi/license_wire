import os
import sys
import json
import hashlib
import uuid
import subprocess

sys.stdout.reconfigure(encoding='utf-8')

app_dir = r"C:\Users\Avell Mizin\Documents\New project 2\acervo-plugins"
wrangler_bin = os.path.join(app_dir, "node_modules", "wrangler", "bin", "wrangler.js")
wrangler_config = os.path.join(app_dir, "wrangler.jsonc")

plugin_root = r"D:\WIRE PROJECTS\SliceOutliner Pro by Mizin"
divulgacao_dir = os.path.join(plugin_root, "Divulgacao", "sliceoutliner-pro-v3")

plugin_id = "wire-c38a9d15024e819b"
plugin_name = "SliceOutliner Pro v3"
plugin_slug = "sliceoutliner-pro-v3"
plugin_version = "v3.0.0"

def get_file_info(file_path):
    with open(file_path, "rb") as f:
        data = f.read()
    return {
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest()
    }

files_to_upload = [
    {
        "role": "source",
        "name": "SliceOutliner Pro v3 Editavel.zip",
        "path": os.path.join(plugin_root, "SliceOutliner Pro v3 Editavel.zip"),
        "mime": "application/zip"
    },
    {
        "role": "compiled",
        "name": "SliceOutliner Pro v3.cwired",
        "path": os.path.join(plugin_root, "SliceOutliner Pro v3.cwired"),
        "mime": "application/octet-stream"
    },
    {
        "role": "thumb",
        "name": "thumb.png",
        "path": os.path.join(divulgacao_dir, "thumb.png"),
        "mime": "image/png"
    },
    {
        "role": "panel",
        "name": "painel-efeitos.png",
        "path": os.path.join(divulgacao_dir, "painel-efeitos.png"),
        "mime": "image/png"
    },
    {
        "role": "feed",
        "name": "instagram-feed.png",
        "path": os.path.join(divulgacao_dir, "instagram-feed.png"),
        "mime": "image/png"
    },
    {
        "role": "raw",
        "name": "efeito.png",
        "path": os.path.join(divulgacao_dir, "efeito.png"),
        "mime": "image/png"
    }
]

manifest_files = []
for f in files_to_upload:
    if not os.path.exists(f["path"]):
        raise FileNotFoundError(f"Arquivo não encontrado: {f['path']}")
    info = get_file_info(f["path"])
    f_id = str(uuid.uuid4())
    object_key = f"plugins/{plugin_id}/{f_id}/{f['name']}"
    manifest_files.append({
        "id": f_id,
        "role": f["role"],
        "name": f["name"],
        "path": f["path"],
        "bytes": info["bytes"],
        "sha256": info["sha256"],
        "mime": f["mime"],
        "object_key": object_key
    })

print(f"--- 1. Fazendo Upload de {len(manifest_files)} arquivos para o Cloudflare R2 (acervo-mizin-files) ---")
for mf in manifest_files:
    print(f"Enviando [{mf['role']}] {mf['name']} ({mf['bytes']} bytes)...")
    cmd = [
        "node", wrangler_bin,
        "r2", "object", "put",
        f"acervo-mizin-files/{mf['object_key']}",
        "--remote",
        "--file", mf["path"],
        "--content-type", mf["mime"],
        "--config", wrangler_config
    ]
    res = subprocess.run(cmd, cwd=app_dir, capture_output=True, text=True, env={**os.environ, "WRANGLER_SEND_METRICS": "false"})
    if res.returncode != 0:
        print(f"ERRO no upload de {mf['name']}:\n{res.stderr}\n{res.stdout}")
        sys.exit(1)
    print(f"  ✓ Upload concluído com sucesso!")

print("\n--- 2. Atualizando Banco de Dados D1 (acervo-mizin-db) ---")
def sql_escape(s):
    return "'" + str(s).replace("'", "''") + "'"

now = "2026-10-19T14:15:00.000Z"

description = "Source de moldura Pro para Resolume Wire e Arena com degradê de até 4 cores, cantos arredondados individuais, modo quadro inteiro, por slice ou modo pórtico (merge slices contíguos sem emenda interna), BPM sync nativo, controle de direção, fluxo duplo (dual head) com colisão e flash aditivo, segmentos e glow. Otimizado com bypass dinâmico para 0% de sobrecarga de GPU quando o modo pórtico está inativo."
review_note = "SliceOutliner Pro v3 compilado no Resolume Wire 7.28.1 nativo. Testado com bypass dinâmico de GPU, modo pórtico integrado, BPM sync e dual head. Hashes de binário e editável conferidos."
compatibility = "Compilado no Resolume Wire 7.28.1. Compatível com Resolume Arena e Avenue 7.21+."
requirements = "Resolume Arena ou Wire 7.21+."
installation = "Copie o arquivo SliceOutliner Pro v3.cwired para a pasta Documentos/Resolume Wire/Patches/ ou arraste diretamente para a aba Sources no Resolume Arena/Avenue."
release_notes = "v3.0.0 (build 022) — Lançamento da v3: Modo Pórtico (Merge Slices) para eliminação de emendas em testeiras e arcos de LED, BPM Sync com multiplicadores, Direction Control (Normal, Inverted, Ping-Pong), Dual Head com colisão e flash visual, interface ergonômica com botões rápidos e bypass inteligente de GPU."

sql_statements = [
    f"INSERT INTO plugins(id, name, platform, category, description, source_path, review_note, visibility, created_at, updated_at) "
    f"VALUES({sql_escape(plugin_id)}, {sql_escape(plugin_name)}, 'Wire', 'Bordas', {sql_escape(description)}, {sql_escape(plugin_root)}, {sql_escape(review_note)}, 'private', {sql_escape(now)}, {sql_escape(now)}) "
    f"ON CONFLICT(id) DO UPDATE SET name=excluded.name, platform=excluded.platform, category=excluded.category, description=excluded.description, source_path=excluded.source_path, review_note=excluded.review_note, updated_at=excluded.updated_at;",

    f"INSERT INTO plugin_profiles(plugin_id, slug, version, compatibility, requirements, installation, release_notes, released_at) "
    f"VALUES({sql_escape(plugin_id)}, {sql_escape(plugin_slug)}, {sql_escape(plugin_version)}, {sql_escape(compatibility)}, {sql_escape(requirements)}, {sql_escape(installation)}, {sql_escape(release_notes)}, {sql_escape(now)}) "
    f"ON CONFLICT(plugin_id) DO UPDATE SET slug=excluded.slug, version=excluded.version, compatibility=excluded.compatibility, requirements=excluded.requirements, installation=excluded.installation, release_notes=excluded.release_notes, released_at=excluded.released_at;"
]

for mf in manifest_files:
    sql_statements.append(
        f"INSERT INTO artifacts(id, plugin_id, role, name, object_key, mime, bytes, sha256, active, created_at) "
        f"VALUES({sql_escape(mf['id'])}, {sql_escape(plugin_id)}, {sql_escape(mf['role'])}, {sql_escape(mf['name'])}, {sql_escape(mf['object_key'])}, {sql_escape(mf['mime'])}, {mf['bytes']}, {sql_escape(mf['sha256'])}, 1, {sql_escape(now)}) "
        f"ON CONFLICT(id) DO UPDATE SET name=excluded.name, object_key=excluded.object_key, mime=excluded.mime, bytes=excluded.bytes, sha256=excluded.sha256, active=1;"
    )

sql_statements.append(
    f"SELECT p.id, p.name, pr.slug, pr.version, (SELECT COUNT(*) FROM artifacts a WHERE a.plugin_id = p.id AND a.active = 1) AS active_artifacts FROM plugins p JOIN plugin_profiles pr ON pr.plugin_id = p.id WHERE p.id = {sql_escape(plugin_id)};"
)

batch_sql = "\n".join(sql_statements)
sql_file = os.path.join(plugin_root, "dist_update.sql")
with open(sql_file, "w", encoding="utf-8") as f:
    f.write(batch_sql)

print(f"Executando transação SQL no D1 ({len(sql_statements)} statements)...")
cmd_d1 = [
    "node", wrangler_bin,
    "d1", "execute", "acervo-mizin-db",
    "--remote",
    "--file", sql_file,
    "--config", wrangler_config
]
res_d1 = subprocess.run(cmd_d1, cwd=app_dir, capture_output=True, text=True, env={**os.environ, "WRANGLER_SEND_METRICS": "false"})
if res_d1.returncode != 0:
    print(f"ERRO no D1:\n{res_d1.stderr}\n{res_d1.stdout}")
    sys.exit(1)

print("D1 Response:\n", res_d1.stdout)
print("\n🎉 Publicação no Cloudflare acervo-mizin concluída com sucesso total!")
