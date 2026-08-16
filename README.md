# Planos de Governo 2026

Site público e base auditável para comparar, tema por tema, os planos das candidaturas à Presidência da República registrados no Tribunal Superior Eleitoral.

O projeto não atribui notas, rankings ou resumos editoriais. A unidade principal é a citação literal, ligada ao documento oficial, ao hash SHA-256, à página física do PDF e à metodologia usada na classificação.

## Estado atual

- Metodologia 1.0 congelada antes da classificação de planos reais.
- Metadados eleitorais monitorados nos arquivos consolidados e no DivulgaCandContas; divergências permanecem sinalizadas até a conciliação oficial.
- PDFs preservados por hash em armazenamento imutável, sem sobrescrita.
- Candidaturas aparecem como “em análise” até que o corpus completo e os 13 temas sejam revisados.
- Nenhuma célula pendente é interpretada como ausência de proposta.

## Executar localmente

Requer Node.js 22.13 ou superior.

```bash
npm ci
npm run dev
```

Validação completa e build de produção:

```bash
npm run ci
```

Atualização controlada das fontes:

```bash
npm run data:sync
npm run data:stage-pdfs
npm run data:validate
npm run data:snapshot
```

`data:sync` atualiza somente metadados e nunca classifica propostas. `data:stage-pdfs` baixa o pacote oficial, confere assinatura, tamanho e hash de cada PDF e prepara objetos imutáveis em `.wrangler/r2-staging/`, que não é versionado.

## Organização

- `app/`: experiência pública e rotas de auditoria.
- `content/`: metodologia e conteúdo editorial versionado.
- `lib/data/`: contratos tipados, validação e carregamento do snapshot.
- `scripts/`: ingestão, preservação e geração reproduzível das exportações.
- `public/dados/`: snapshot atual e versões imutáveis para download.
- `docs/`: operação, publicação, privacidade e auditoria.
- `.github/`: validação contínua, monitoramento do TSE e formulário de correção.

## Regras editoriais essenciais

Cada candidatura publicada precisa ter exatamente um estado para cada um dos 13 temas, revisão integral após ao menos 48 horas e vínculo verificável entre proposta, ocorrência, arquivo, hash e página. OCR serve apenas para localização; toda citação exige conferência visual humana.

A [metodologia 1.0](content/metodologia/1.0.md) detalha os critérios A1–A3, as regras de segmentação e deduplicação e as compensações adotadas para codificador único.

## Fontes e licenças

Os metadados e documentos eleitorais vêm exclusivamente do [Portal de Dados Abertos do TSE](https://dadosabertos.tse.jus.br/dataset/candidatos-2026) e do DivulgaCandContas.

O código está sob [MIT](LICENSE). Metodologia e dados editoriais estão sob [CC BY 4.0](LICENSE-DATA.md), com a atribuição ao TSE indicada no arquivo de licença.
