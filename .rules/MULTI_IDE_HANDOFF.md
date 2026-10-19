# 🤝 PROTOCOLO DE TRANSIÇÃO ENTRE IDES (HANDOFF PROTOCOL)

Este workspace é acessado concorrentemente ou sequencialmente por:
- **Google Antigravity**
- **Claude Code**
- **OpenAI Codex / Cursor**

Para que qualquer ferramenta continue exatamente de onde a outra parou sem perda de contexto ou retrabalho, este protocolo deve ser seguido:

---

## 1. 📋 REGISTRO DE SESSÃO NO `README.MD` DO ALVO
Ao finalizar ou pausar qualquer sessão de engenharia reversa em um alvo específico (`targets/<alvo>/README.md`), o agente ou operador DEVE atualizar a seção:

```markdown
## 📍 Estado Atual e Próximos Passos (Última atualização: YYYY-MM-DD por [Antigravity|Claude|Codex])

### O que foi feito:
- [x] Mapeada função X em `0x0045A120`
- [x] Extraído dump JSON de imports via REA

### O que está pendente:
- [ ] Analisar struct passada como 2º parâmetro em `sub_45A120`
- [ ] Validar algoritmo de checksum em `scripts/test_checksum.py`

### Bloqueios / Notas críticas:
- Binário possui packer UPX modificado; foi desempacotado estaticamente em `binaries/unpacked.exe`.
```

---

## 2. 💾 PERSISTÊNCIA DE EVIDÊNCIAS
- **Nunca guarde conclusões apenas no chat do agente.** O contexto de chat é volátil.
- Salve todos os outputs, payloads, descompilações relevantes ou comandos no diretório do alvo (`evidence/` ou `notes/`).
- Atualize o `CHANGELOG.md` do alvo.

---

## 3. 🎯 IDENTIFICADORES DE DESCOBERTA (REV-TAGS)
Use tags curtas para referenciar descobertas entre arquivos:
- `[REV-001]`: Descoberta do algoritmo de criptografia.
- `[REV-002]`: Mapeamento do handshake websocket.
- `[REV-003]`: Estrutura do payload de telemetria.

Essas tags facilitam buscas globais rápidas via ripgrep (`grep_search`) por qualquer agente.
