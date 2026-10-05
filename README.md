# ⚓ Simulador de Atracação Portuária (Plano de Atracação)

[![React](https://img.shields.io/badge/React-19.0-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7.1-646CFF?style=flat&logo=vite&logoColor=white)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-Vanilla_CSS-38B2AC?style=flat&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

O **Simulador de Atracação Portuária** é uma aplicação web interativa de engenharia e planejamento operacional portuário voltada para a elaboração, simulação visual, validação geométrica e compartilhamento de **Planos de Atracação de Navios** em cais contínuos e berços especializados.

A ferramenta permite aos operadores e práticos simular o posicionamento métrico longitudinal de navios, cabos de amarração (lançantes e springs), cabeços numerados reais, passadiços/escadas de portaló (gangway) e portêineres de cais (STS - Ship-to-Shore Cranes), com auditoria automática de afastamentos mínimos e conformidade com recomendações internacionais (**PIANC**, **ROM 3.1-99** e **NORMAM**).

---

## 📑 Sumário

- [Visão Geral](#-visão-geral)
- [Funcionalidades Principais](#-funcionalidades-principais)
- [Tecnologias Utilizadas](#-tecnologias-utilizadas)
- [Visualização 3D](#7-visualização-3d-esquemática)
- [Instalação e Execução](#-instalação-e-execução)
- [Estrutura do Projeto](#-estrutura-do-projeto)
- [Guia de Manutenção e Configuração](#-guia-de-manutenção-e-configuração)
  - [1. Posições e Tipos de Cabeços](#1-posições-e-tipos-de-cabeços-csv)
  - [2. Portêineres e Infraestrutura de Carga](#2-portêineres-e-infraestrutura-de-carga-p4-a-p9)
  - [3. Catálogo de Navios](#3-catálogo-permanente-de-navios)
  - [4. Amarrações e Cabos (Popa + Proa)](#4-amarrações-e-cabos-kit-popa--proa)
- [Padrões e Fórmulas de Engenharia](#-padrões-e-fórmulas-de-engenharia)
- [Autor](#-autor)

---

## 🧭 Visão Geral

Nas operações portuárias, a alocação de navios em berços exige precisão milimétrica para garantir:
1. **Margem de manobra e segurança de cais**: afastamentos regulamentares entre navios e extremidades de cais.
2. **Distribuição adequada de cabos e cabeços**: alinhamento longitudinal de lançantes e springs com cabeços certificados no cais.
3. **Compatibilidade de guindastes (Portêineres)**: alcance de esteira dos guindastes sem interferência na superestrutura dos navios.
4. **Posicionamento de portaló (Gangway)**: acesso seguro para tripulação e autoridades portuárias em áreas desimpedidas.

O simulador transforma cálculos complexos em um **Blueprint visual 2D em escala real (SVG)** interativo, permitindo arrastar navios, conectar cabos e gerar relatórios instantâneos.

---

## 🌟 Funcionalidades Principais

### 1. Blueprint Vetorial 2D (Escala Real em Metros)
- Desenho vetorial em SVG de alta precisão proporcional à metragem real do cais (ex.: 399 m a 367 m de estaqueamento).
- Visualização de detalhes como borda do cais, defensas cilíndricas/cônicas, cabeços numerados e marcação visual de proa (seta roxa) e popa (seta laranja).
- Interação por arrastar e soltar (*drag & drop*) ou ajuste numérico fino por campo de estação.

### 2. View Atracação (Modo Tela Cheia & Telão Operacional)
- Botão **`View Atracação`** dedicado que abre uma janela maximizada ou tela cheia sem distrações, ideal para centros de controle operacional (CCO) e salas de reunião de atracação.
- HUD superior com zoom ajustável (padrão otimizado de 204%), ajuste automático à largura da tela e telemetria de navios atracados.

### 3. Exportação Gráfica em Alta Resolução (2.5x HD)
- **Salvar no PC**: Gera e descarrega diretamente um arquivo PNG em altíssima resolução (~2750 px de largura) para o computador do usuário, pronto para impressão e arquivamento oficial.
- **Compartilhar para WhatsApp**: Suporte a compartilhamento nativo e cópia automática para a área de transferência (`Ctrl + V`), permitindo colar diretamente em grupos operacionais do WhatsApp Web.

### 4. Gestão de Amarrações (Kit Rápido "Cabos Popa + Proa")
- Botão **`Cabos Popa + Proa`**: adiciona instantaneamente no topo da lista os 4 cabos regulamentares:
  - 1 Lançante de proa (`lancante-proa`)
  - 1 Spring de proa (`spring-proa`)
  - 1 Spring de popa (`spring-popa`)
  - 1 Lançante de popa (`lancante-popa`)
- Cálculo automático de *offset* em função do LOA (comprimento total) da embarcação.
- Conexão interativa da ponta amarela do cabo diretamente ao cabeço desejado no cais.

### 5. Portêineres e Infraestrutura de Carga (P4 a P9)
- Modelagem de 6 portêineres reais (P4 a P9) com limites operacionais individuais de curso (esteira de trilhos).
- Detecção em tempo real de interferências, distâncias mínimas de segurança entre portêineres e compatibilidade de trabalho sobre as baías dos navios.

### 6. Catálogo de Navios & Persistência Local
- Banco de navios com dimensões reais (LOA, Boca, Calado, Tipo de Embarcação).
- Persistência contínua no navegador (`localStorage`) e capacidade de exportação/importação de cenários completos em JSON.

### 7. Visualização 3D Esquemática
- O botão **`Visualização 3D`** (na barra superior e na régua de controles) abre uma representação tridimensional do cenário atual, sem alterar os dados ou substituir o blueprint 2D.
- Usa um modelo procedural de alta fidelidade: casco longitudinal com 9 balizas e curvas de bojo (*bilge*), convés contornado com amurada, fileiras de contêineres coloridas com cantoneiras, ponte escalonada com janelas e identificação lateral (*nameplate*); modelos especializados para Porta-Contêineres, Petroleiros/Químicos (manifold e tubovias), Carga Geral/Graneleiros (escotilhas e paus de carga) e Apoio Offshore (PSV/AHTS).
- Mostra também cabos de amarração em catenária (*tube bezier*), cais com guia de acostagem e trilhos de guindaste, cabeços com numeração em sprites 3D, defensas e escadas de portaló.
- Os portêineres mostram pernas inclinadas de terra e de mar, pórtico com contraventamentos, bogies com oito rodas por canto, casa de máquinas/contrapeso, carretel de cabo, torre e tirantes, lança treliçada, trolley com cabine, cabos de içamento e spreader.
- Controles de órbita, aproximação/afastamento (*zoom*) e deslocamento (*pan*); botão **`Restaurar enquadramento`** retorna à perspectiva inicial.
- Renderização sob demanda baseada em Three.js/WebGL 2, sem consumo ocioso de GPU quando a câmera está imóvel.

---

## 🛠️ Tecnologias Utilizadas

| Componente | Tecnologia | Finalidade |
|---|---|---|
| **Linguagem** | TypeScript 5.6 | Tipagem estática rigorosa para física, coordenadas e modelos portuários |
| **Interface** | React 19 | Arquitetura reativa de componentes e controle de estado |
| **Renderizador 2D** | SVG (Scalable Vector Graphics) | Precisão métrica, zoom contínuo e renderização nítida sem perda de qualidade |
| **Visualizador 3D** | Three.js / WebGL 2 | Modelo esquemático sob demanda com câmera orbital; licença MIT |
| **Estilização** | CSS3 & TailwindCSS | Interface moderna, responsiva, contrastada e com estética náutica profissional |
| **Ícones** | Lucide React | Ícones operacionais limpos e consistentes |
| **Build & Dev** | Vite 7.1 | Inicialização instantânea e empacotamento ultrarrápido |
| **Exportação** | HTML5 Canvas / Blob API | Renderização offscreen em 2.5x para geração de imagens HD |

---

## 🚀 Instalação e Execução

### Pré-requisitos
- **Node.js** (versão 18.0.0 ou superior recomendada)
- Gerenciador de pacotes **npm** ou **pnpm**

### Passo a Passo

1. **Clonar o Repositório:**
   ```bash
   git clone https://github.com/Dalmocabral/simulador-de-atraca--o.git
   cd simulador-de-atraca--o
   ```

2. **Instalar as Dependências:**
   ```bash
   npm install
   ```

3. **Iniciar o Servidor de Desenvolvimento:**
   ```bash
   npm run dev
   ```
   Acesse a aplicação no navegador em: `http://localhost:5173`

4. **Compilar para Produção (Build Web):**
   ```bash
   npm run build
   ```
   Os arquivos otimizados serão gerados na pasta `dist/`.

5. **Gerar os Executáveis Desktop (.exe para Windows):**
   ```bash
   # Gerar tanto o Instalador (.exe) quanto a Versão Portátil (.exe):
   npm run electron:all

   # Ou para testar no ambiente de desenvolvimento:
   npm run electron:dev
   ```
   Os executáveis gerados ficam disponíveis na pasta `dist-electron/`:
   - 📦 `Simulador de Atracação Setup 1.0.0.exe`: Instalador completo (com atalhos no Desktop e Menu Iniciar).
   - 🚀 `Simulador_de_Atracacao_Portatil.exe`: Versão portátil (roda direto sem precisar instalar).

6. **Executar a Verificação de Tipos (TypeScript Check):**
   ```bash
   npm run check
   ```

---

## 📁 Estrutura do Projeto

```plaintext
simulador-de-atracação/
├── client/
│   ├── public/                    # Ativos estáticos públicos
│   │   ├── bollards/              # Imagens e vetores dos cabeços de amarração
│   │   └── logo.png               # Logotipo da empresa/terminal
│   └── src/
│       ├── components/
│       │   ├── berth-blueprint.tsx    # Motor gráfico SVG do cais, navios, defensas e cabos
│       │   ├── BerthViewModal.tsx     # Janela modal maximizada "View Atracação"
│       │   ├── AddVesselModal.tsx     # Modal para cadastro e seleção de novos navios
│       │   └── ui/                    # Componentes de UI (Dialog, Tabs, etc.)
│       ├── lib/
│       │   ├── berth-model.ts         # Modelo de dados, regras PIANC, cálculos de metragem
│       │   ├── export-image.ts        # Motor de exportação de imagem PNG (PC & WhatsApp)
│       │   └── vessel-catalog.ts      # Gerenciamento do catálogo permanente de navios
│       ├── pages/
│       │   ├── Simulator.tsx          # Painel principal do simulador e editor de atracação
│       │   └── BerthStandaloneView.tsx# Rota isolada para visualização dedicada em telões
│       ├── caislab.css                # Folha de estilo customizada para layout portuário
│       └── main.tsx                   # Ponto de entrada React
├── server/                            # Endpoints auxiliares e contratos de servidor
├── vessels_catalog.json               # Dados pré-configurados de embarcações
├── ARQUITETURA.md                     # Documentação de premissas e limites técnicos
├── package.json                       # Scripts e dependências do projeto
└── README.md                          # Este documento
```

---

## 🔧 Guia de Manutenção e Configuração

### 1. Posições e Tipos de Cabeços (CSV)
Os cabeços representam a infraestrutura de amarração do cais. Suas estações reais podem ser cadastradas individualmente na interface ou carregadas em lote via arquivo CSV.

- **Formato do CSV:**
  ```csv
  identificador;posicao_m;tipo
  399;10.5;duplo
  398;30.3;alto-novo
  397;50.1;baixo-antigo
  ```
- **Tipos de Cabeço Suportados:**
  - `duplo`: Cabeço duplo de alta capacidade (azul).
  - `alto-novo`: Cabeço tipo coluna moderno (cinza).
  - `alto-antigo`: Cabeço alto clássico (oliva).
  - `baixo-antigo`: Cabeço baixo tipo cogumelo (laranja).
  - `avariado`: Cabeço fora de operação / interditado (vermelho tracejado).
- **Como Atualizar Imagens de Cabeços:**
  As imagens e vetores utilizados para renderizar os cabeços ficam armazenados em `client/public/bollards/`:
  - `cabeco-duplo.png`
  - `cabeco-alto-novo.jpg`
  - `cabeco-alto-antigo.jpg`
  - `cabeco-baixo-antigo.png`

### 2. Portêineres e Infraestrutura de Carga (P4 a P9)
A configuração dos limites de esteira de cada portêiner fica localizada no arquivo [`client/src/lib/berth-model.ts`](file:///d:/Programação/simulador%20de%20atracação/client/src/lib/berth-model.ts).

Para alterar a esteira ou a largura de um portêiner:
```typescript
export const PORTAINER_CONFIGS = [
  { id: "P4", minPosition: 0, maxPosition: 120, width: 27 },
  { id: "P5", minPosition: 20, maxPosition: 160, width: 27 },
  // ...
];
```

### 3. Catálogo Permanente de Navios
Novos navios podem ser registrados pelo botão **"Adicionar Navio"** ou configurados no arquivo `vessels_catalog.json`:
- `name`: Nome de registro da embarcação.
- `loa`: Comprimento total fora a fora (*Length Overall*) em metros.
- `beam`: Boca moldada (largura máxima) em metros.
- `draft`: Calado de projeto ou calado operacional em metros.
- `vesselType`: Tipo de embarcação (`container`, `general-cargo`, `tanker`).

### 4. Amarrações e Cabos (Kit Popa + Proa)
Ao clicar em **`Cabos Popa + Proa`**, o sistema executa a função `addMooringKit` localizada em [`Simulator.tsx`](file:///d:/Programação/simulador%20de%20atracação/client/src/pages/Simulator.tsx).
Os limites angulares e percentuais de posicionamento ao longo do casco seguem as recomendações de boas práticas marinhas:
- **Proa (Bow)**: Linhas posicionadas entre 70% e 100% do LOA (medido a partir da popa).
- **Popa (Stern)**: Linhas posicionadas entre 0% e 30% do LOA.

---

## 📐 Padrões e Fórmulas de Engenharia

O simulador implementa cálculos determinísticos com base nas diretrizes internacionais de planejamento portuário:

### 1. Folga Longitudinal Entre Navios ($S$)
De acordo com o **PIANC WG 158 / ROM 3.1-99**:
$$S \approx 10\% \text{ a } 15\% \text{ do LOA do maior navio (mínimo de } 15\text{ m a } 20\text{ m)}$$

### 2. Extensão Mínima de Cais Requerida
$$\text{Cais Requerido} = \sum \text{LOA}_i + \sum \text{Afastamentos Entre Navios} + \text{Folga de Proa/Popa com Limites do Cais}$$

Se o cais requerido exceder o comprimento total disponível dos berços contíguos cadastrados, o simulador emite automaticamente alertas de advertência em destaque visual âmbar/vermelho.

---

## 👤 Autor

Desenvolvido por **Dalmo dos Santos Cabral**

- 💼 **LinkedIn:** [dalmo-cabral-062374131](https://www.linkedin.com/in/dalmo-cabral-062374131/)
- 🐙 **GitHub:** [Dalmocabral](https://github.com/Dalmocabral)
- 📧 **Contato:** Disponível via perfil do LinkedIn e GitHub

---

*Este simulador é uma ferramenta de apoio ao planejamento visual preliminar e tomada de decisão operacional.*
