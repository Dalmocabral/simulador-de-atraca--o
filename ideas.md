# Direção de design — Simulador de Atracação

## Fonte da direção
A referência fornecida pelo usuário é o blueprint operacional atual em Excel: uma faixa de cais horizontal, diferentes trechos identificados, navios porta-contêineres vistos de cima e dimensões do navio em destaque. Ela é a referência funcional e visual para o canvas, mas não deve ser copiada como colagem nem reproduzir marcas da empresa ou de armadores. Transformar o diagrama em uma ferramenta digital editável, preservando sua leitura de cais + trechos + navios.

## Direção comprometida: Mesa de Operações Portuárias
- **Movimento de design:** ferramenta técnica de operações portuárias: precisa, legível e confiável, sem a aparência de uma planilha improvisada.
- **Princípios:** desenho do cais é o foco; escala e unidades são explícitas; dados editáveis permanecem próximos da visualização; alertas distinguem claramente demonstração de validação operacional.
- **Filosofia de cor:** azul-marinho e azul-petróleo para navegação e identidade marítima; fundo claro neutro para leitura; linhas de cais em cinza ardósia; ciano para seleção e dados; âmbar para atenção; vermelho reservado a conflito/ultrapassagem. As cores dos navios auxiliam a identificação, sem codificar segurança como fato.
- **Paradigma de layout:** cabeçalho compacto com contexto do cenário; área principal larga e horizontal para o blueprint; painel lateral para navios/dimensões; controles auxiliares em cartões discretos. O desenho continua utilizável em tela menor com rolagem horizontal do canvas.
- **Elementos de assinatura:** faixa horizontal segmentada para o cais, marcações métricas graduadas, casco vetorial visto de cima, linha d'água, posições inicial/final e áreas de afastamento.
- **Interação:** edição imediata no formulário; navios arrastáveis na faixa; campos numéricos para ajuste exato; ao mover, mostrar a posição e recalcular ocupação em tempo real; não permitir que a interface sugira que o protótipo verificou profundidade ou amarração.
- **Animação:** apenas transições curtas de seleção e feedback de posição; respeitar `prefers-reduced-motion`; nenhuma animação decorativa que atrapalhe leitura técnica.
- **Tipografia:** sans-serif de sistema com boa legibilidade em português; números tabulares para LOA, posição, margem e comprimento de cais.
- **Essência da marca:** clareza operacional e planejamento visual.
- **Tom de voz:** direto, neutro e explícito quanto a unidade, premissas e limitações.
- **Logo/wordmark:** símbolo original geométrico de casco e linha de cais, acompanhado do nome “CaisLab”/“Atracação”. Não reproduzir os logotipos visíveis na imagem de referência.
- **Cor de assinatura:** azul-marinho profundo, complementado por ciano de navegação.
- **Amarração e acesso:** o eixo da escada é um marco violeta editável; os cabeços 399–277 são pequenos marcadores identificáveis apenas depois de inserir a estação real; lançantes e springs são linhas vetoriais ligadas aos pontos informados do navio e ao cabeço selecionado. Não inferir o espaçamento a partir da numeração.
- **Precisão visual:** usar coordenadas e entradas numéricas explícitas, CSV com `identificador;posicao_m` e rótulos/tooltips para cabeços próximos; deixar dados ausentes em branco e manter o aviso de que o desenho não calcula segurança ou esforços de amarração.

## Ativos
Ferramenta interna de operações/dados: o blueprint e os navios serão componentes vetoriais de interface em SVG, não imagens fotográficas. Criar somente o ícone original de marca exigido para o novo projeto, em SVG e PNG; não buscar nem gerar imagens decorativas sem uso concreto.
