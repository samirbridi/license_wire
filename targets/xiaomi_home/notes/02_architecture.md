# Arquitetura candidata

Separar descoberta/autorização da conta, sessão de mídia com a câmera, adaptação de codecs e apresentação nos clientes.

Câmera ↔ ponte na LAN ↔ clientes Android/Windows. Para acesso externo, adicionar transporte autenticado até a ponte. Trata-se de proposta, não de arquitetura observada nos dispositivos do usuário.

A ponte exige um equipamento disponível no local. Windows, mini-PC ou NAS são opções a avaliar; ainda não há escolha de hardware ou framework.

Google Home e SmartLife têm requisitos próprios. Vídeo ao vivo não comprova suporte a cartão SD, notificações ou controle de movimento.
