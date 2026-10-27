# Manual do robô do Radar Brasil

Este arquivo é lido pelas tarefas agendadas do Claude que mantêm o app atualizado.
O app fica em `radar/` no repositório `EliabeAnger/tempo_agora` (site publicado pelo ramo `gh-pages`)
e tem uma cópia na raiz do repositório `EliabeAnger/radar_brasil`.

Site: https://eliabeanger.github.io/tempo_agora/radar/

O app já busca sozinho, ao vivo, o dólar, as moedas, as ações, os indicadores do Banco Central e as notícias do Google Notícias.

Existe também um **robô gratuito do GitHub** (`.github/workflows/radar-robo.yml` + `radar/tools/robo.py`, sem IA) que roda
**de hora em hora** e grava em `dados.json` os números com fonte oficial: `indicadores.itens` (Banco Central), `mercado.moedas`,
`mercado.ibov`, `mercado.acoes` e `noticias` de reserva. O resultado de cada execução fica em `dados.json` → `robo`.

**O Claude NÃO deve pesquisar nem mexer nesses campos.** Use os valores que estão em `dados.json` como fonte dos números
nas histórias e em `referencia`. Assim cada execução do Claude é mais curta (economiza uso) e os números vêm das fontes oficiais.

O Claude cuida do que precisa de interpretação: **as histórias explicadas, o alerta do dia, os juros futuros (DI), os
combustíveis da ANP, a linha do tempo da eleição, o Copom e o Boletim Focus**.

## Modos

- **ATUALIZAR** (por volta das 6h40, 11h40 e 17h40 de Brasília): pesquisa e atualiza `dados.json`.
- **FECHAR O DIA** (23h de Brasília): faz uma última ATUALIZAR e depois roda `python3 radar/tools/arquivar.py`,
  que guarda o dia em `radar/arquivo/AAAA-MM-DD.json`, atualiza `radar/arquivo/indice.json` e zera as "atualizacoes" do dia.

## Passo a passo

1. Conecte e clone os dois repositórios (`EliabeAnger/tempo_agora` e `EliabeAnger/radar_brasil`) com acesso de escrita.
   Configure o git: `git config user.name Claude` e `git config user.email noreply@anthropic.com`.
2. Leia `radar/dados.json` inteiro e anote a data e hora atuais em Brasília (UTC-3).
3. **Leia os números do robô** em `dados.json` (`robo.atualizadoEm`, `mercado`, `indicadores.itens`) e use-os como estão.
   Se `robo.atualizadoEm` tiver mais de 3 horas ou `robo.falhas` mostrar um número importante faltando, você pode pesquisar só esse
   número e mencionar a falha no resumo final.
4. **Pesquise** com busca na web (modo extended para fatos do dia), só o que o robô não cobre:
   - Os 3 a 5 assuntos mais importantes do dia no Brasil, o que explica os movimentos do mercado, e como a imprensa
     internacional fala do Brasil.
   - Juros futuros DI (jan/27, jan/28, jan/31, jan/33, jan/35), Copom e Boletim Focus mais recente.
   - Combustíveis: levantamento semanal mais recente da ANP (gasolina, etanol, diesel S10 e S500, GLP 13 kg, GNV).
   - Eleição presidencial: andamento do pedido de anulação, decisões do TSE/STF, transição, posse.
   Depois atualize em `dados.json`, mantendo exatamente o formato atual:
   - `atualizadoEm`: agora, em ISO com fuso, ex. `2026-10-27T12:05:00-03:00`.
   - `alerta`: uma frase curta com o fato mais importante do momento (ou "" se não houver nada urgente).
   - `mercado.juros`, `indicadores.copom`, `indicadores.focus`, `indicadores.focusData`.
   - `combustiveis`: só muda quando sair levantamento novo da ANP; atualize também o texto `semana`.
   - `eleicoes.linhaTempo`: acrescente fatos novos com data (dd/mm); mantenha o item de posse com `"futuro": true`.
   - Não mexa em `mercado.moedas`, `mercado.ibov`, `mercado.acoes`, `indicadores.itens`, `noticias` nem `robo`.
5. **Histórias** (`historias`, de 3 a 6, a mais importante primeiro). Cada uma conta um assunto em começo, meio e fim:
   - `inicio`: 2 ou 3 frases com os fatos e números.
   - `porque` e `cadeia` (3 a 7 passos de causa e efeito, frases curtas).
   - `outraLeitura`: a visão de quem discorda ou o outro lado. **Obrigatório em temas políticos e econômicos.**
   - `cenarios`: otimista, base e pessimista (ou incerto), **sempre dizendo quem prevê** (banco, consultoria, Focus, especialista).
   - `saidas`: o que pode resolver ou aliviar a situação, de forma concreta.
   - `bolso`: dicas práticas para a pessoa comum (pode ficar vazio em temas sem efeito no bolso).
   - `fontes`: links https reais das matérias usadas.
   - `indicadores`: quais números ao vivo o app mostra junto (`dolar`, `ibov`, `selic`, `ipca`, `etanol`).
   - `referencia`: `{"dolar": ..., "ibov": ..., "selic": ...}` com os valores usados ao escrever; o app avisa o leitor quando mudarem.
   - `atualizadoEm`: hora desta atualização, em ISO com fuso.
   - **Durante o dia**: se uma história já existia e algo mudou, mantenha o mesmo `id`, atualize o texto e **acrescente** em
     `atualizacoes` um item `{"hora": "12h", "texto": "o que mudou, em uma frase"}`. Não apague as atualizações do dia.
   - Assunto novo e relevante vira história nova com `id` curto sem espaços (ex. `copom-nov`). Assunto que perdeu importância sai
     da lista (ele continua guardado nos dias anteriores).
6. **Regras de qualidade**:
   - Seja fiel aos fatos e justo com todos os lados. Em política, apresente os argumentos de cada lado com o mesmo cuidado e
     não dê opinião própria sobre quem está certo.
   - Escreva tudo com suas palavras, em português do Brasil simples. Nenhuma citação de mais de 15 palavras de uma fonte.
   - Não invente números: se não achar um dado novo, mantenha o anterior.
   - Previsão não é recomendação: nada de "compre" ou "venda" ativos específicos.
7. Rode `python3 radar/tools/validar.py`. Se der erro, corrija e rode de novo até passar.
8. No modo FECHAR O DIA, rode depois `python3 radar/tools/arquivar.py` (data de hoje em Brasília) e `validar.py` de novo.
9. Publique (o robô do GitHub também grava no `main`, então sempre traga as mudanças dele antes):
   - Antes do commit: `git stash`, `git pull --rebase origin main`, `git stash pop`. Se `dados.json` der conflito, fique com a
     versão do robô para os campos dele e com a sua para o resto, e rode `validar.py` de novo.
   - Em `tempo_agora`: commit em `main` com mensagem "Radar Brasil: atualização HHh de DD/MM" (ou "fechamento de DD/MM"),
     `git push origin HEAD:main` e depois `git push origin HEAD:gh-pages` (o gh-pages acompanha o main; use fetch e confira
     que é avanço simples antes de enviar).
   - Em `radar_brasil`: copie o conteúdo de `tempo_agora/radar/` para a raiz (sem apagar o README.md), commit e push em `main`.
10. Termine com um resumo curto: o que mudou, quantas histórias, e qualquer problema encontrado.

Se algo impedir a publicação (sem acesso ao GitHub, validação que não passa), não force: deixe tudo como estava e explique no resumo.
