# Operação, monitoramento e publicação

Este documento descreve a automação reprodutível do projeto. A ingestão nunca roda no navegador e nenhuma rotina publica automaticamente uma codificação nova: alteração de fonte exige conciliação e revisão humana.

## Contratos executáveis

Os workflows chamam diretamente estes comandos, sem depender de aliases no `package.json`:

```text
node scripts/tse/sync-metadata.mjs
node scripts/tse/stage-pdfs.mjs
node scripts/tse/upload-pdfs.mjs
node scripts/tse/mark-pdfs-preserved.mjs --base-url /arquivos
node scripts/data/validate.mjs
node scripts/data/regression-checks.mjs
node scripts/data/build-snapshot.mjs --check
npm audit --audit-level=high
npm run lint
npm run build
node --test tests/*.test.mjs
```

O sincronizador recebe a cadência efetiva em `TSE_MONITOR_CADENCE`, com um dos valores `hourly`, `daily` ou `weekly`. No monitor, ele sempre roda com `--check`: consulta as fontes sem alterar conteúdo, cobertura ou snapshots. A execução editorial sem `--check` só ocorre em uma alteração revisável. O sincronizador consulta somente o catálogo, os ZIPs e o serviço oficial do TSE; o REST serve para detecção antecipada, enquanto uma publicação continua condicionada à reconciliação com o recurso consolidado.

A detecção usa a assinatura `semantic-v2`: nomes, números, partido, estados oficiais, IDs e multiconjuntos de hashes dos PDFs entram na comparação; horários de geração, `ETag`, `Last-Modified` e o hash do ZIP bruto não entram, porque podem mudar diariamente sem alteração eleitoral. Esses hashes e horários brutos continuam preservados no registro de auditoria. Testes de regressão provam que regenerar o mesmo ZIP não reinicia a estabilidade e que mudar metadados eleitorais ou qualquer PDF reinicia.

O projeto não precisa de dependência adicional para a camada de auditoria: testes usam `node:test`, hashing usa `node:crypto` e os workflows usam apenas ações oficiais do GitHub.

Aliases disponíveis no `package.json`:

```json
{
  "scripts": {
    "data:sync": "node scripts/tse/sync-metadata.mjs",
    "data:stage-pdfs": "node scripts/tse/stage-pdfs.mjs",
    "data:upload-pdfs": "node scripts/tse/upload-pdfs.mjs",
    "data:validate": "node scripts/data/validate.mjs",
    "data:snapshot": "node scripts/data/build-snapshot.mjs",
    "test:audit": "node scripts/data/regression-checks.mjs && node --test tests/*.test.mjs",
    "test": "npm run build && npm run test:audit",
    "ci": "npm run data:validate && node scripts/data/build-snapshot.mjs --check && npm run lint && npm run build && npm run test:audit"
  }
}
```

Os workflows usam os comandos diretos nos pontos em que uma opção adicional, como `--check`, faz parte do gate.

## Validação de pull request

`.github/workflows/validate-build.yml` instala exatamente o lockfile, audita vulnerabilidades altas/críticas de todas as dependências — inclusive a cadeia de build e React Server Components que pode influenciar o bundle —, valida o conteúdo, reconstrói as exportações, exige árvore limpa em `public/dados`, executa lint, build e todos os testes. O build resultante fica disponível por sete dias apenas para inspeção técnica.

O validador aceita `--root <diretório>` para fixtures isoladas. O gerador aceita `--check --root <diretório>` para confirmar reprodução sem alterar a árvore; sem `--check`, ele grava o snapshot calculado.

A publicação deve consumir um único diretório imutável `public/dados/snapshots/<snapshot>` e só atualizar `public/dados/latest` de maneira atômica quando todo o pipeline passar. O release Git correspondente usa a tag assinada `dados-AAAA-MM-DD.N`.

## Cadência do monitor

`.github/workflows/tse-monitor.yml` possui três agendas UTC e uma execução manual. Como o GitHub não altera expressões cron em tempo de execução, as três agendas despertam um gate pequeno; somente a agenda que coincide com o estado persistido continua até a consulta ao TSE. O modo seguro inicial é horário.

| Modo | Agenda UTC | Uso operacional |
|---|---:|---|
| `hourly` | minuto 17 de cada hora | registros novos, divergência ou menos de 72 horas de estabilidade |
| `daily` | 06:37 diariamente | julgamentos, substituições ou retificações; também após 72 horas estáveis |
| `weekly` | segunda-feira, 07:53 | após 14 dias sem alteração nem pendência jurídica |

O estado fica na issue única `Estado automático do monitor TSE`, criada pelo `github-actions[bot]` e identificada por um marcador de versão. Uma issue homônima criada por outro autor é ignorada. Seu corpo registra apenas `cadence`, `stableSince`, `lastCheckAt`, `lastChangeAt`, o último resultado e os indicadores booleanos de divergência e situação oficial pendente. O workflow atualiza o corpo em toda verificação efetiva e comenta somente o início da estabilidade, uma transição ou a primeira detecção de uma mudança; assim existe trilha pública sem anexar respostas, ZIPs ou PDFs.

A máquina de estados é automática e testada com relógio determinístico:

1. `sourceStatus=divergent` força `hourly` e impede o início do relógio, mesmo quando não apareceu uma diferença nova naquela execução.
2. Depois da conciliação, a primeira verificação sem mudança inicia `stableSince` e mantém `hourly`.
3. Ao completar 72 horas consecutivas sem mudança, passa para `daily`.
4. Julgamento, substituição, retificação, recurso ou outra situação oficial pendente impede `weekly`; após 72 horas, permanece em `daily` pelo tempo necessário.
5. Ao completar 14 dias desde o início da estabilidade, passa para `weekly` somente se não houver divergência nem situação oficial pendente.
6. Qualquer diferença nova zera `stableSince`, registra `lastChangeAt` e volta para `hourly` antes de abrir o alerta e falhar a execução.
7. Depois que uma alteração for conciliada, a primeira verificação novamente estável inicia um novo período.

Se a issue estiver ausente, ela é criada usando `TSE_MONITOR_CADENCE` apenas como valor inicial opcional; valor inválido recua para `hourly`. Se o bloco de estado existente estiver corrompido, o workflow falha em vez de reiniciar silenciosamente o relógio. Uma execução manual sempre consulta a fonte e pode escolher uma cadência apenas para aquela execução, sem falsificar o histórico persistido.

Opcionalmente, a cadência calculada pode ser espelhada na variável de repositório `TSE_MONITOR_CADENCE` com `gh variable set`. Para isso, configure o secret `TSE_MONITOR_VARIABLE_TOKEN` com um token de granularidade fina, restrito a este repositório e somente com permissão **Variables: write**. O token padrão do workflow continua limitado a `contents: read` e `issues: write`; a automação não depende do espelho para funcionar. A exigência de permissão específica está documentada nos [endpoints oficiais de variáveis do GitHub Actions](https://docs.github.com/en/rest/actions/variables).

Antes do gate, o monitor deriva `hasDivergence` e `hasPendingOfficialStatus` do snapshot público versionado. Em seguida, valida esse snapshot e compara as fontes exclusivamente com `sync-metadata.mjs --check`. Quando encontra diferença oficial, persiste o retorno a `hourly`, abre no máximo um alerta editorial público e falha de forma visível. O alerta contém apenas a cadência e o link da execução; dados brutos não são anexados. Ele nunca executa a sincronização mutante. Em seguida, fora desse workflow, uma alteração editorial controlada executa a sincronização segura, preserva cobertura, propostas, revisões e versões anteriores, marca cada candidatura cujo corpus mudou como `source_changed` e a mantém fora do comparador até a recodificação.

## Preservação dos PDFs

`.github/workflows/preserve-pdfs.yml` é manual, usa o ambiente protegido `r2-pdf-archive` e inicia em simulação. Ele baixa novamente os PDFs oficiais, valida assinatura, marcador final, tamanho e SHA-256 e prepara objetos em diretório efêmero ignorado pelo Git.

No envio real, o workflow não recebe credenciais administrativas da Cloudflare. Ele usa:

- variável `PDF_UPLOAD_ORIGIN`: origem HTTPS da implantação no Sites;
- secret `PDF_UPLOAD_TOKEN`: token compartilhado exclusivamente com o binding secreto homônimo do Sites.

O upload passa por `POST /api/internal/pdfs/<sha256>`, que autentica, limita tamanho, recalcula o hash e só grava no binding R2 gerenciado pelo Sites. Depois, cada objeto é baixado por `/arquivos/<sha256>` e revalidado. Somente então os YAMLs recebem `preserved`, um novo snapshot é gerado e o bot abre um pull request; não há commit direto em `main` nem artefato contendo os PDFs.

## Tags e release do snapshot

`.github/workflows/release-snapshot.yml` roda para `dados-AAAA-MM-DD.N` ou por despacho manual. Ele verifica criptograficamente a tag do snapshot e `metodologia-v1.0` contra `.github/release-signers`, exige que o commit marcado pertença à história protegida de `origin/main`, confirma que o manifesto, o commit e a versão metodológica coincidem e repete todo o CI.

Após aprovação do ambiente `snapshot-release`, o workflow limpa a saída anterior e usa `.github/scripts/package-site.sh`, equivalente ao empacotador oficial, para criar um bundle compatível com o Sites. O arquivo contém `dist/server/index.js`, ativos do build e `dist/.openai/hosting.json`; migrações também seriam incluídas se existissem. A montagem tar/gzip normaliza ordem, permissões, proprietário e horários, e um teste comprova que duas montagens da mesma árvore de build produzem o mesmo hash.

Além do bundle e seu SHA-256, a release contém `sites-handoff-<snapshot>.json`, que vincula tag assinada, commit completo, snapshot, metodologia, hash do manifesto e hash do bundle. Antes da publicação, o próprio workflow produtor atesta criptograficamente o bundle. Toda execução exige GitHub CLI 2.97.0 ou superior, faz a proveniência corresponder ao repositório, ao arquivo de workflow, à tag e ao commit esperados e rejeita artefatos produzidos em runner auto-hospedado. Regras externas ao Git restringem `main` e as tags `dados-*`/`metodologia-v*` à conta administrativa de release; o ambiente `snapshot-release` exige aprovação dessa conta, não permite bypass administrativo e aceita somente `main` ou tags `dados-*`. A imutabilidade de releases está habilitada nas configurações do repositório: depois da publicação, o GitHub bloqueia alterações na tag e nos assets e gera uma atestação criptográfica adicional da release. Um gate exige `isImmutable`, verifica a release e cada um dos três assets com o GitHub CLI e então confere checksum, handoff, tag, commit, manifesto e metodologia. O Vinext cria credenciais internas novas em cada build por segurança; por isso uma reexecução de tag não tenta fabricar uma cópia byte a byte com segredos previsíveis. Ela baixa os assets atestados já publicados e termina sem criar, substituir ou reenviar arquivos. A primeira publicação só pode partir do evento da própria tag assinada; o despacho manual serve para revalidar uma release existente.

Esse modelo trata a conta `ygCEO` e suas credenciais administrativas como a autoridade externa de confiança. Comprometimento total dessa conta está fora do modelo de ameaça do repositório e exige resposta de incidente no provedor, revogação de credenciais e rotação das chaves de release antes de nova publicação.

O GitHub Actions encerra no handoff; ele não possui credencial do conector e não implanta no Sites. Um operador autorizado deve usar o conector autenticado para enviar o SHA exato indicado no handoff ao repositório de origem do Sites, empacotar ou reutilizar o bundle validado, salvar uma versão com aquele mesmo SHA, implantar e acompanhar o estado até sucesso. A credencial curta de escrita não deve ser armazenada como secret permanente do CI. A chave pública autorizada para as tags é versionada; uma rotação exige pull request antes de qualquer nova tag.

## Procedimento de release

1. Confirmar a tag assinada da metodologia usada pelo snapshot.
2. Executar a sincronização e conciliar REST, ZIPs e documentos pelo `SQ_CANDIDATO`.
3. Validar que os 13 temas estão fechados, as fontes são atuais e a revisão fria está registrada.
4. Reconstruir as exportações duas vezes e confirmar conteúdo idêntico.
5. Aprovar o pull request somente com CI verde e checklist de privacidade completo.
6. Criar e enviar a tag SSH assinada `dados-AAAA-MM-DD.N`; o workflow gera a release imutável e o handoff verificável, sem implantar.
7. Um operador autorizado no Sites confirma o handoff, envia o commit exato, salva a versão com o bundle compatível e inicia a implantação.
8. Acompanhar a implantação até sucesso e fazer smoke test das rotas públicas, dos quatro downloads imutáveis e de uma cópia PDF preservada.

Não se deve usar `pull_request_target` para executar conteúdo de contribuição, imprimir secrets, anexar arquivos brutos do TSE ou publicar a partir de uma árvore com alterações locais.
