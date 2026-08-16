# Auditoria, integridade e privacidade

## Cadeia de evidência

Cada proposta pública precisa apontar para uma ocorrência em um documento oficial preservado por SHA-256. A ocorrência registra documento, seção, página física e número impresso quando existir. OCR pode localizar o trecho, mas nunca substitui a conferência visual humana.

O manifesto de cada snapshot relaciona a metodologia congelada, os arquivos públicos e seus hashes. `latest` é apenas um ponteiro copiável para um snapshot imutável; uma auditoria deve sempre citar o identificador do snapshot.

## Limites da automação

A automação verifica forma, integridade e invariantes. Ela não decide se um trecho satisfaz A1–A3, não resolve divergências entre documentos e não confirma visualmente uma página. Essas decisões são editoriais, ficam versionadas e exigem revisão fria.

Uma fonte alterada não herda citações da versão anterior. O estado `source_changed` bloqueia a candidatura no comparador até que todas as ocorrências afetadas sejam recodificadas e revisadas.

## Minimização de dados

A ingestão aplica uma lista positiva de campos eleitorais públicos. CPF, título eleitoral e demais identificadores pessoais presentes nos arquivos brutos não podem aparecer em:

- conteúdo editorial;
- exportações JSON ou CSV;
- bundle e páginas renderizadas;
- logs, resumos ou artefatos do GitHub Actions;
- issues, pull requests e anexos enviados por colaboradores.

Os testes examinam chaves e cabeçalhos proibidos em `latest` e em todos os snapshots, além de procurar e-mails e CPFs válidos nos valores e no bundle publicável. A revisão humana continua necessária para citações literais e anexos, sobretudo para endereços, telefones e títulos eleitorais em texto livre, que não podem ser distinguidos com segurança de todo número público por uma expressão automática.

O estado automático da cadência é guardado em uma issue dedicada e contém apenas modo, instantes, último resultado, dois indicadores booleanos operacionais e links de execução. O monitor não copia para a issue a saída do sincronizador, metadados brutos, nomes de arquivos ou documentos. Comentários repetidos são suprimidos enquanto a mesma alteração ou divergência permanece pendente.

## Invariantes de publicação

- Cada candidatura publicada possui exatamente os 13 temas metodológicos.
- Toda proposta possui exatamente um tema primário e ao menos uma ocorrência canônica verificável.
- `not_found` significa “não foi identificada menção após leitura integral”, nunca pendência de análise.
- `diagnosis_only` exige trecho e página; não pode coexistir com proposta no mesmo tema.
- Candidaturas com estado editorial `pending`, `awaiting_consolidation`, `in_review`, `source_changed` ou `unverifiable` não entram no comparador.
- Um achado temático `unverifiable` é um estado fechado e publicável: aparece como “não foi possível verificar” e jamais é convertido em ausência.
- Hash, página, verificação visual e revisão fria de 48 horas são obrigatórios antes da publicação.
- Exportações não contêm campos fora da lista positiva nem misturam dois snapshots.

## Correções públicas

O formulário estruturado de correção pede URL/ID afetado, documento oficial, página, conteúdo atual e justificativa. Duas confirmações obrigatórias reduzem o risco de fonte não canônica e de exposição de dados pessoais.

Uma correção aceita gera pull request, novo snapshot e entrada no changelog. O estado anterior permanece acessível para que a mudança possa ser reconstruída e auditada.
