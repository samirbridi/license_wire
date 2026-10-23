# Visão geral e proveniência

Entrada: `C:\Users\Avell Mizin\Downloads\P2P_HTTP\SLICE REFINER.cwired`, 230087 bytes.
SHA-256: `3299103010c89a2699f76ef1ae19724023694d76750b93223b42746f64a68de1`.
Cópia em binaries preservada e verificada. Original: kpt hippo, SLICE REFINER v2.0,
save target 7.14.2, deployment target 7.14.0, original target 7.11.0.

Triagem: cabeçalho de contêiner v1, alta entropia e ausência de PE/ZIP. A CLI REA 6.7.0
não reconheceu esse formato: `evidence/rea-artifact.json`. Seguiu-se análise estática do
runtime instalado WireLib.dll via Ghidra, com resultados em evidence/bundle-*.c.
O contêiner contém apenas patch.wire, 229959 bytes, SHA-256
`5ea3e293b9ea8f2c37067f5a1f6e393030800c3eabad56a81150c8ca41809365`.

O fluxo de análise não altera o arquivo recebido, o editor instalado ou a autorização do produto.
A reconstrução tem novo UUID e autoria próprios. O patch proprietário extraído fica em evidência privada,
não é a fonte do build independente nem faz parte do ZIP de entrega.

Entradas funcionais do efeito: vídeo RGBA, listas de slices e parâmetros expostos pelo host.
Saída funcional: uma textura RGBA. O grafo não contém ISF, DLL personalizada ou recurso externo.
Não foi identificado protocolo de rede próprio no arquivo analisado.
