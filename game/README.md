# Medievaliant

Jogo de estratégia em tempo real, single player, em pixel art, para celular e desktop. Mistura a ideia de "colocar tropas e ver elas lutarem" com uma pegada medieval mais lenta e tática. Cada lado tem um castelo, o objetivo é destruir o castelo inimigo. Há um campo único (sem lanes) com obstáculos aleatórios, uma fase de preparação antes da batalha, economia de ouro com plantação e um bot como adversário.

Este documento descreve **o que o jogo faz, por que foi feito assim e como o código está organizado**, para que outra pessoa (ou outro agente de IA) possa continuar o desenvolvimento sem ter que redescobrir as decisões.

---

## 1. Como rodar

- **Um único arquivo:** `index.html` (HTML + CSS + JavaScript, ~2.400 linhas, ~165 KB).
- Sem build, sem dependências, sem servidor, sem internet, sem imagens externas, sem áudio.
- Abra o arquivo direto no navegador, ou publique em qualquer hospedagem estática (GitHub Pages, Netlify etc.).
- A pasta `game/` deste repositório contém o jogo. O `index.html` da raiz do repositório é outro projeto (um editor de código) e não tem relação.
- O arquivo publicado como "artefato" no claude.ai é o mesmo código sem as tags `<!doctype>`, `<html>`, `<head>` e `<body>`, que a plataforma adiciona.
- Idioma da interface: português do Brasil.
- Nome do jogo: **Medievaliant**. Aparece na tag `<title>` e no título da moldura do jogo (só visível quando sobra espaço acima do campo). A chave do `localStorage` continua `castelos-config` (nome antigo) de propósito, para não perder as configurações já salvas; pode ser renomeada se não houver jogadores a preservar.

### Testes
Não há testes automáticos no repositório. Durante o desenvolvimento os testes foram scripts Playwright (Chromium headless) que abriam a página, chamavam funções internas via `window.__game` e `evaluate`, simulavam partidas inteiras com `update(1/60)` em laço e tiravam screenshots. Vale recriar isso se o projeto crescer (ver seção 11).

---

## 2. Stack e princípios técnicos

| Item | Decisão |
|---|---|
| Linguagem | JavaScript puro (ES2020), sem frameworks nem bibliotecas |
| Render | Um `<canvas>` 2D. Desenha num canvas interno em **pixels lógicos** (`buf`) e o amplia com **escala inteira** |
| Arte | **Nenhuma imagem.** Sprites, castelos, terreno, UI e fontes são gerados por código |
| Entrada | Pointer Events (mouse e toque iguais) |
| Persistência | Apenas `localStorage` (chave `castelos-config`: mão dominante e daltonismo) |
| Aleatoriedade | `Math.random` (`R`), exceto o fundo, que usa uma semente (ver 6.6) |

### Regra de ouro: todo pixel tem o mesmo tamanho
Foi uma exigência explícita do projeto. Consequências no código:

- O canvas interno tem `W × H` pixels lógicos (campo `MW × H` + coluna lateral `SW = 52`). Ele é copiado para a tela com `drawImage` em escala **inteira** (`SC`), com `imageSmoothingEnabled = false`.
- Nunca se amplia texto nem sprite por fator fracionário ou por 2x isolado. Existem fontes próprias já no tamanho final (ver 8).
- O tamanho do campo se adapta à tela (função autoexecutável `fit()` no topo): `MW` varia de 216 a 336 e `H` de 600 a 840 pixels lógicos, sempre em múltiplos de 8. A escala `SC` é a maior inteira que cabe. O resto da tela vira uma moldura fina dourada (`buildFrame`).
- O tamanho é calculado **uma vez, ao abrir a página**. Girar a tela ou redimensionar a janela depois reajusta só a escala e a moldura, não o tamanho lógico do campo.

### Correção de cor
Ao copiar `buf` para a tela, aplica-se uma correção de saturação/contraste (`grade()`): usa `ctx.filter` quando existe, senão um laço por pixel. Constantes `POST`, `SAT`, `CON`, `BRI`. A moldura passa pelo mesmo tratamento.

---

## 3. Visão geral do jogo

### Fluxo de uma partida
1. **Preparação (`phase = 'setup'`)**: cada lado tem **30 moedas** (`SETUP_COINS`). O jogador coloca tropas no próprio lado do campo. Pode desfazer (botão DESFAZER) ou tocar numa tropa/cerca sem carta selecionada para removê-la (devolve as moedas). Ao tocar em PRONTO, o bot monta a formação dele (que só então aparece) e a partida começa.
2. **Contagem (`'count'`)**: 3, 2, 1, "BATALHA!" (3,2 s). O jogo está parado.
3. **Batalha (`'battle'`)**: economia de **ouro** (0 a 10) para colocar novas tropas. As unidades lutam sozinhas. O jogador só decide *quando e onde* colocar mais tropas.
4. **Fim**: o castelo que chegar a 0 de vida perde. Também dá para **render-se** (botão com confirmação). Tela de VITÓRIA (com confete) ou DERROTA; tocar reinicia.

Ao fim da preparação, o jogador recebe ouro inicial `min(10, 5 + moedasQueSobraram × 0,5)`; o bot começa com 5.

### Ritmo
O jogo foi pedido lento e estratégico. Tudo na simulação é multiplicado por `SPEED = 0.62` (movimento, ataque, projéteis, ouro). A contagem, as telas finais e as animações de interface rodam em tempo real.

### Economia
- Ouro máximo: **10**. Renda base: `BASE_GOLD = 1/2,6` ouro por segundo de jogo (≈ 0,24/s real).
- Camponeses plantam e aumentam a renda (ver 4.10).
- A barra de ouro **pisca** quando chega a 10 (aviso de desperdício).
- Na preparação, o saldo é de "moedas" e não rende nada; não há desperdício.

---

## 4. Tropas e estruturas

Todos os números ficam no objeto `DEF` (seção `UNIDADES`) e são **palpites iniciais de equilíbrio**, nunca ajustados com playtest sério. Unidades de ataque corpo a corpo usam `range` pequeno; `r` é o raio de colisão; `mass` define quem empurra quem; `aggro` é o raio em que procuram inimigos; `speed` é em pixels lógicos/s antes de `SPEED`.

| Carta | Nome | Custo | Vida | Dano | Recarga (s) | Alcance | Velocidade | Observação |
|---|---|---|---|---|---|---|---|---|
| `pawn` | Peão | 2 | 120 | 10 | 0,9 | 3 | 10 | Corpo a corpo, barato |
| `archer` | Arqueiro | 3 | 90 | 9 | 1,5 | 62 | 10 | Flecha, o maior alcance |
| `alchemist` | Alquimista | 6 | 100 | 20 | 2,4 | 54 | 9 | Poção em arco com **dano em área** (raio 16) |
| `knight` | Cavaleiro | 5 | 360 | 26 | 1,4 | 4 | 15 | Montado, rápido |
| `paladin` | Paladino | 9 | 680 | 40 | 1,4 | 4 | 14 | Mais forte e muito mais caro que o cavaleiro |
| `bishop` | Clérigo | 4 | 140 | 7 | 1,5 | 30 | 9 | Cura 18 a cada 1,4 s (alcance de cura 36) |
| `necro` | Necromante | 7 | 110 | 0 | – | – | 0 | Fica parado e invoca esqueletos |
| `skeleton` | Esqueleto | – | 30 | 6 | 1,0 | 3 | 13 | Invocado, dura 26 s |
| `fence` | Cerca | 2 | 260 | – | – | – | – | Barreira com estacas |
| `farmer` | Camponês | 6 | 80 | 0 | – | – | 7 | Planta na roça, limite de 4 |

A ordem das cartas na coluna lateral é o array `CARDS`. O id interno do clérigo é `bishop` (histórico; o nome exibido é CLÉRIGO).

### 4.1 Combatentes comuns (`warrior`)
Peão, cavaleiro, paladino, arqueiro, alquimista e esqueleto usam a mesma IA: procuram o inimigo mais próximo dentro de `aggro` (reavaliam a cada 0,3 a 0,5 s), atacam se estiver no alcance e, sem inimigo, **vão para o castelo inimigo** (ponto de contato mais próximo da muralha). Também atacam a plantação inimiga quando passam a menos de 20 px dela. O alvo é largado se ficar além de 1,6 × `aggro`.

### 4.2 Clérigo (`bishopAI`)
Regra pedida: curar sempre quem tem **menos vida proporcional** dentro do alcance de cura, e seguir preferencialmente quem tem menos vida. Detalhes:
1. A cada 1,4 s cura o aliado ferido de menor `hp/max` entre os que estão a até 36 px.
2. Escolhe quem seguir pelo menor percentual de vida (a distância só desempata), num raio de 190 px. Máximo de 2 clérigos por alvo (o segundo só se o alvo estiver abaixo de 40%).
3. Sem ninguém ferido, acompanha o grupo **sem nunca recuar** (só se move para o lado ou para a frente em relação ao inimigo).
4. Sem nenhum aliado por perto (170 px), age como combatente e avança.

### 4.3 Alquimista
Projétil `potion` com trajetória em arco (altura = `sin(π·progresso)·14`). Ao chegar, `splashPotion` causa dano a todos os inimigos no raio 16, com queda de 45% na borda; também atinge cercas (60%), castelo (80%, se o raio tocar) e plantação (80%). Cada poção sorteia uma cor, deixa partículas e uma poça que dura ~2,2 s.

### 4.4 Necromante
Imóvel. Invoca um esqueleto a cada 4,5 s (o primeiro em 1,4 s), no máximo 5 vivos por necromante. Esqueletos duram 26 s (piscam nos últimos 4 s) e **somem se o necromante morrer**. Não contam em abates nem em "tropas".

### 4.5 Cavaleiro e paladino
Mesmos combatentes comuns, com atributos maiores. O paladino tem sprites próprios, maiores (46×38 de lado, 30×38 de frente e de costas), com armadura dourada e cavalo branco; na carta aparece um recorte da vista frontal.

### 4.6 Cerca
- Ocupa 3 tiles de largura por 1 de altura. Tem 260 de vida.
- **Não bloqueia ninguém**: as unidades atravessam. Quem atravessa uma cerca **inimiga** perde `FENCE_DMG = 10` de vida a cada 0,8 s enquanto estiver sobre ela, e a cerca perde `FENCE_WEAR = 6` por estacada.
- Cercas aliadas não fazem nada. Não se pode colocar cerca sobre outra, sobre obstáculos nem sobre roças.
- Na prática é uma estrutura de desgaste/atraso, não de parede.

### 4.7 Castelo
Cada castelo tem **2600** de vida e dispara flechas (18 de dano a cada 1,1 s, alcance de 74 px da muralha) no inimigo mais próximo. Tem 104×48 px. O castelo do jogador (embaixo) aparece **de costas** (sem portão), o do bot **de frente**.

### 4.8 Camponês e roça
Cada lado tem uma **roça** de **exatamente 30 tiles**, forma sorteada, posicionada entre o castelo e o meio do campo. O camponês só pode ser colocado sobre os tiles da roça. Cada camponês escolhe o canteiro livre mais próximo, caminha até ele e planta em ~2,4 s.

A planta cresce em 4 fases (semente 0–2 s, broto 2–6 s, crescendo 6–10 s, espiga 10 s+) e rende ouro/s: `0, 0,007, 0,013, 0,02` por canteiro (função `cellRate`). Com a roça cheia e madura a renda sobe de ≈ 0,24 para ≈ 0,6 ouro/s real. A roça pode ser atacada: cada 6 de dano destrói um canteiro plantado.

### 4.9 Limite de camponeses
`MAX_FARMERS = 4` vivos por lado (suficiente para encher a roça).

### 4.10 Colocação sem bloqueio
**Regra do projeto: nunca recusar uma colocação.** `findSpot(team, type, x, y)` procura o ponto permitido mais próximo do toque. Exemplos: tocar no campo inimigo coloca na linha tracejada do meio (mesmo X); tocar sobre pedra, castelo, outra tropa ou cerca desloca para o espaço livre mais próximo. As únicas recusas são ouro insuficiente, limite de camponeses ou ausência total de espaço. O fantasma de pré-visualização já mostra o ponto ajustado.

---

## 5. Bot

Funções `botFormation` (preparação) e `botUpdate` (batalha), na seção `BOT`.
- **Preparação:** gasta as 30 moedas: 1–2 cercas (55%), 1–2 camponeses, necromante (75%), paladino (45%, se sobrar), 1–3 cavaleiros, 0–2 clérigos, alquimista (60%), 1–3 arqueiros e peões com o resto. Posições sorteadas (linha, cunha, cavaleiros à frente) com clérigos e arqueiros atrás da frente.
- **Batalha:** a cada 0,5–1,3 s decide: mantém um necromante em campo, repõe camponeses (até 5), cerca na frente de ameaça, reforça o lado se o jogador invade, ou compra tropa pelo plano sorteado em `pickPlan()`.
- O bot **não trapaceia na economia** (mesmas regras de ouro), mas é considerado fácil.

---

## 6. Mapa e terreno

Grade de tiles de 8 px (`COLS = MW/8`, `ROWS = H/8`, array `kind`). Códigos de `kind`: 0 grama livre, 1 montanha, 2 lago, 4 castelo/construção, 7 reservado (cerca, hoje não usado no mapa), 8 marcador temporário da roça durante a geração.

### 6.1 Geração (`genMap`)
Até 150 tentativas, cada uma colocando em ordem: roças reservadas, **um lago por jogador** (60 tiles = o dobro da roça, forma sorteada), **3 ou 4 montanhas** (tamanhos 36–50, 28–38, 16–24, 10–16 tiles), **um brejo por jogador** (44 tiles). Cada mapa só é aceito se `connected()` confirmar: todos os tiles livres formam uma região só e há **corredores com folga** (3 tiles) ligando os castelos, cobrindo ≥ 94% da área livre "aberta". Isso existe para impedir tropas presas.

Formas (`growShape`): elipse com razão sorteada (de redonda a alongada) e crescimento aleatório com borda irregular, número exato de tiles.

### 6.2 Obstáculos
Hoje só **lagos** e **montanhas** são sólidos (sem árvores, pedrinhas ou troncos soltos, por decisão após muitos casos de unidades presas). O código dos sprites de árvore (`buildTrees`, pinheiros e carvalhos) e a lista `trees` ainda existem, mas a geração não cria árvores.

### 6.3 Brejo
Terreno que **reduz a velocidade de todos a 50%** (`SWAMP_SLOW`). O A\* dá custo 1,8 ao brejo. Unidades afundam 1 px, ganham anel de lama e respingos. Visual: lama escura com poças esverdeadas e bolhas.

### 6.4 Castelo e pátio
`buildCompound` gera, dos dois lados, muralha de fundo, muralhas frontais e laterais ligadas ao castelo, torres de canto e ao longo das muralhas, subcastelos, casas, capela, caserna, celeiro, poços, fardos e barris. Tudo é **decoração sólida** (marca os tiles como `kind = 4`), não é alvo nem rende nada. O piso do pátio é calçamento de pedra (`paveCourtyards`).

### 6.5 Ordem de desenho (z-index)
Regra definida pelo usuário, **assimétrica**:
- O castelo e as construções **do jogador** (metade de baixo) são desenhados **depois** das tropas (camada `structCanvas`).
- O castelo e as construções **do inimigo** (metade de cima) são desenhados **antes** das tropas (camada `structEnemy`).
- Entre as demais coisas: chão → sombras de nuvem → água/shimmer → roças → destaque de colocação → castelo inimigo → tropas e cercas (ordenadas por Y) → castelo do jogador e construções → projéteis, partículas, textos → borboletas e pássaros → UI.

### 6.6 Fundo estático com semente
`buildBackground(recolor)` desenha chão, estradas, lagos, brejos, montanhas, roças, pátio e construções num canvas só (`bgCanvas`). Usa `R` substituído por um gerador com semente (`mulberry`, semente `bgSeed`) para que **reconstruir o fundo reproduza exatamente o mesmo mapa**. Isso é usado ao trocar o modo de daltonismo (cores dos times estão "assadas" nas construções). Para isso o `kind` é restaurado de um snapshot (`kindPre`) antes da reconstrução, porque `buildCompound` altera `kind`. **Se você adicionar algo ao fundo que use `R`, mantenha essa ordem de chamadas estável** ou o mapa mudará ao recolorir.

---

## 7. Movimento, colisão e pathfinding

- Unidades têm posição contínua `(x, y)`. A colisão com o terreno usa `free(x, y)`, que testa os 4 cantos de uma caixa de 5×5 contra `kind === 0`.
- **A\*** (`astar`, `findPath`) sobre a grade, 8 direções, sem cortar quinas, com heurística octil. Primeiro tenta caminhos **largos** (evitando tiles vizinhos a obstáculos, `solidNear`); se falhar, tenta o caminho normal. Limite de 4000 iterações. Brejo custa 1,8.
- Quando há linha reta livre (`lineClear`, testada a cada ~0,3 s) vai direto, sem A\*.
- Separação entre unidades por empurrão proporcional à massa (raio de colisão + 1,5 px).
- **Anti-travamento (`unstick`)**: se uma unidade fica mais de 1,2 s sem se mover enquanto deveria, ou se está dentro de um obstáculo, é movida para o ponto livre mais próximo com folga. Foi adicionado depois de várias reclamações de unidades presas.

---

## 8. Arte procedural

### 8.1 Sprites de unidades
Pipeline em `renderGrid(grid, pal)`: uma grade de caracteres (cada letra = um material, ver `pal` em `bakeAll`) vira pixels com **sombreamento automático** (borda iluminada em cima/esquerda, escura embaixo/direita, com mudança de matiz) e **contorno seletivo** colorido.

- `compose` monta sprites a partir de blocos de texto; o paladino, o alquimista e partes novas usam construtores de formas (`gEll`, `gBox`, `gLn`, `gKite`).
- Cada tropa tem várias **vistas direcionais**: `E` (lado), `S` (frente), `N` (costas), `NE` (lado com nuca). Diagonais usam a vista de lado/nuca, e a direção oeste é o espelhamento da leste. A vista é escolhida por `viewOf(u)` a partir do vetor `(fx, fy)` suavizado.
- Cada vista tem 2 quadros de caminhada. Em repouso há "respiração" (sobe 1 px de vez em quando).
- Três variantes pré-assadas por vista: normal, contorno vermelho de dano (`ringR`) e verde de cura (`ringG`), usadas nas **bordas piscantes** de 0,13 s (`FX_T`).
- Paleta dos times em `TEAM[0]` (azul, jogador) e `TEAM[1]` (vermelho, bot).

### 8.2 Castelo e estruturas
`bakeCastle(team, back)` desenha o castelo principal (torres cônicas na cor do time, ameias, seteiras, portão de grade ou muralha lisa quando `back`). As estruturas do pátio têm funções próprias (`towerSpr`, `keepSpr`, `houseSpr`, `chapelSpr`, `barnSpr`, `barracksSpr`, `wallSpr`, `wallVSpr` etc.). Bandeiras tremulando são desenhadas a cada frame por `drawCastle`.

### 8.3 Fontes (todas em pixel 1:1)
- `FONT` (3×5): texto pequeno (cartas, números, dicas). Acentos em `ACC`.
- `BIG` (5×7): títulos grossos e números grandes (`drawBig`).
- Fonte "manuscrito" (`MSK`, `medGlyph`, `drawMed`): letras de 9 px de altura geradas por esqueletos de traço e uma "pena de ponta chata" (2×1), com serifas, sombra de tinta e inicial em vermelho. Usada nos pergaminhos (`scroll`, `banner`). **Só maiúsculas.** Se precisar de um caractere novo, adicione-o a `MSK` (e `MACC` para acentos) e, para o texto pequeno, a `FONT`/`ACC`.

### 8.4 UI
Cantos arredondados (`rr`), cartas com janela em arco e faixa de nome, medidor de ouro em cápsula de vidro, botões com relevo e rebites, placas de latão, correntes, arabescos nos cantos do campo (`drawCorners`) e moldura (`buildFrame`). A coluna lateral é `SW = 52` px: 4 de moldura de cada lado e 44 de miolo centrado em `MW + 26`.

### 8.5 Animações
Bandeiras, tochas do castelo, brilho da água (`shimmer`), plantas balançando, bolhas do brejo, sombras de nuvens, pássaros, borboletas, poeira nos passos, partículas de golpe/morte/cura, poções, confete na vitória (`confetti`), anel pulsante da carta selecionada, barra de ouro cheia piscando, botão PRONTO pulsando.

---

## 9. Interface e controles

- **Colocar tropa:** toque numa carta (fica selecionada, com anel ciano/dourado piscando) e depois no seu lado do campo. Também dá para arrastar a carta até o campo. A carta continua selecionada para colocar várias seguidas; tocar nela de novo desmarca.
- **Remover (só na preparação):** com **nenhuma** carta selecionada, tocar numa tropa ou cerca sua a remove e devolve as moedas.
- **DESFAZER (só na preparação):** desfaz a última colocação.
- **PRONTO (preparação):** inicia a batalha.
- **RENDER-SE (batalha):** ocupa o lugar do PRONTO. Um toque pede confirmação ("CONFIRMA?", 3 s); o segundo toque rende.
- **Engrenagem (canto superior esquerdo do campo):** abre **AJUSTES** e pausa o jogo.
- **Painel de estatísticas** (coluna lateral, abaixo dos botões): DANO total, ABATES, TROPAS vivas e TEMPO, comparando você e o inimigo. Mostra só os blocos que cabem na altura da tela.
- Mensagens e telas finais aparecem em **pergaminhos**.

### Configurações (`SETTINGS`, salvas em `localStorage` `castelos-config`)
- **Mão dominante:** destro (padrão) ou canhoto. Canhoto **apenas move a coluna lateral para a esquerda**: o buffer é copiado em duas partes espelhadas e `toLogical()` converte as coordenadas do toque de volta.
- **Daltonismo:** `NENHUM`, `VERMELHO-VERDE` (inimigo vira âmbar, bordas de dano amarela e de cura ciano, inimigos ganham sombra pontilhada no chão) e `AZUL-AMARELO` (seu time vira turquesa). Aplicar um modo refaz sprites, castelos e fundo (`applyColorblind(mode, true)`).

---

## 10. Estrutura do código (por seção)

Tudo está em um `<script>`, na ordem abaixo. Os títulos `// =====` do arquivo marcam as seções:

1. **CONSTANTES**: tamanho do campo (`fit`), paleta `C`, `TEAM`, `grade`, utilitários (`clamp`, `hash`).
2. **SPRITES**: geradores de sprites, `renderGrid`, `compose`, `VIEWS`, `bakeAll`.
3. **FONTES**: `FONT`, `BIG`, `drawText`, `drawBig`.
4. **UNIDADES**: `DEF`, `CARDS`, posições da coluna lateral.
5. **MAPA**: `genMap`, `growShape`, `connected`, fazendas, `makeCastles`.
6. **PATHFINDING**: `astar`, `findPath`, `lineClear`.
7. **ESTADO**: variáveis globais, `reset`, `spawn`, `findSpot`, `deploy`, `undo`, `startBattle`, fazenda.
8. **ANIMAÇÕES AMBIENTE**: nuvens, pássaros, borboletas, confete.
9. **COMBATE**: `damage`, `attack`, `warrior`, `bishopAI`, `necroAI`, `farmerAI`, poções, cercas.
10. **BOT**: `botFormation`, `botUpdate`, `pickPlan`.
11. **UPDATE**: `update(dt)` (um passo da simulação).
12. **ARTE ESTÁTICA**: `buildBackground`, castelos, compound, árvores, lateral, moldura.
13. **RENDER**: `render()` e todas as funções `draw*`.
14. **INPUT**: `toLogical`, eventos de ponteiro, `resize`.
15. **LOOP / CONFIGURAÇÕES**: `frame()` com `requestAnimationFrame`, menu de ajustes.

### Estado principal
`phase` (`setup`, `count`, `battle`), `units`, `fences`, `projs`, `parts`, `texts`, `gold[2]`, `coins[2]`, `castles[2]`, `farms[2]`, `kind` (grade), `swp` (grade de brejo), `over`, `stats`, `sel` (carta selecionada), `hist` (histórico para DESFAZER).

### Passo da simulação
`update(dt)` limita `dt` a 50 ms, multiplica por `SPEED` e executa: ambiente → renda de ouro → bot → IA de cada unidade (movimento, ataque, anti-travamento, espinhos de cerca) → separação entre unidades → tiros dos castelos → projéteis → partículas → remoção dos mortos.

### Ganchos para testes
`window.__game` expõe `units`, `deploy`, `castles()`, `gold()`, `update`, `startBattle`, `undo`, `hist`, `phase`. Muitas funções internas também são acessíveis no escopo global da página (por exemplo `reset`, `findSpot`, `connected`, `applyColorblind`).

---

## 11. Decisões de projeto e armadilhas

- **Sem árvores nem pedras pequenas**: os bonecos ficavam presos entre obstáculos pequenos. A solução foi obstáculos grandes e sólidos + folga mínima nos corredores + anti-travamento.
- **Cercas não bloqueiam**: o desenho original era uma barreira, mas gerava impasses. Agora são "espinhos": atravessáveis, causam dano.
- **Colocação nunca falha**: reclamação recorrente do usuário; por isso `findSpot`.
- **Ritmo lento** (`SPEED`, `BASE_GOLD`) pedido explicitamente para um jogo menos dinâmico e mais estratégico.
- **Tudo procedural**: mantém o jogo em um arquivo só e permite recolorir por código (daltonismo).
- **Altura mínima do campo 600**: com 9 cartas e o painel de estatísticas a coluna lateral não cabe em menos; telas baixas reduzem a escala em vez de espremer a interface.
- **Fundo com semente**: não troque a ordem de chamadas a `R()` dentro de `buildBackground` e funções que ele chama sem entender (ver 6.6).
- **`kind` é a fonte da verdade das colisões**: construções e o fundo marcam tiles com `kind = 4`. Qualquer elemento novo que bloqueie passagem precisa marcar tiles, senão unidades atravessam.
- **`over` bloqueia a simulação** (`if (!over && phase === 'battle')`): a pausa das animações ambiente continua.
- **Renomeações**: bispo → clérico → clérigo e agricultor → camponês só mudaram o *nome exibido*; os ids internos continuam `bishop` e `farmer`.
- **IDs e acentos**: para exibir letras acentuadas é preciso ter o glifo e o acento na fonte correspondente (ver 8.3).

---

## 12. Limitações conhecidas e ideias

### Limitações
- Sem áudio, sem multiplayer, sem testes automáticos no repositório.
- O bot é simples e fácil; não há níveis de dificuldade.
- Equilíbrio das tropas não validado. Alguns pontos óbvios: vários clérigos juntos curam muito; paladino e cavaleiro ainda dominam combates de contato; alquimistas em grupo podem limpar peões.
- A economia (camponeses) foi pouco testada em partidas longas.
- O tamanho do campo é fixado ao carregar a página.
- Uma única arquivo de ~165 KB é difícil de navegar.
- A engrenagem de ajustes fica sobre a muralha do castelo inimigo.
- Pontos de arte que o usuário pode querer refinar: rosto do cavalo do paladino de lado, tamanho do cavaleiro frente ao cavalo.

### Sugestões de evolução
1. **Modularizar**: separar em `sprites.js`, `mapa.js`, `ia.js`, `ui.js`, `unidades.json`, com um build simples (esbuild/Vite) que ainda gere um HTML único.
2. **Dados de equilíbrio externos**: mover `DEF`, custos e constantes para JSON.
3. **Testes**: automatizar os scripts Playwright usados no desenvolvimento (geração de 25+ mapas, partidas simuladas, cenários de colocação, anti-travamento).
4. **Níveis de dificuldade** do bot e perfis (agressivo, defensivo).
5. **Som**: efeitos simples gerados por WebAudio (golpe, poção, confete, clique) mantendo a ausência de arquivos externos.
6. **Mais conteúdo**: campanhas/mapas fixos, mais tropas, construções destrutíveis, bônus de captura.
7. **Multiplayer** (exigiria separar lógica de simulação da renderização e ter um loop determinístico).
8. **Responsividade total**: recalcular o tamanho do campo ao girar a tela.

---

## 13. Licença
O repositório original inclui `LICENSE` na raiz (MIT).
