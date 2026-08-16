# Metodologia de Comparação — Planos de Governo (Presidenciais 2026)

**Versão 0.1 — rascunho de trabalho, 15/08/2026.**
Este documento é o "livro de códigos" do projeto: define o que conta como proposta, como classificar, como citar e como controlar viés. Quando finalizado, torna-se a página pública de metodologia do site.

---

## 1. Princípios

O site **compara, não avalia**. A objetividade não é uma promessa — é operacionalizada por quatro compromissos:

1. A unidade de análise e as regras de classificação são definidas **antes** da leitura de qualquer plano (pré-registro).
2. Todas as regras são públicas, versionadas e datadas.
3. Toda proposta exibida é rastreável a uma citação literal, com página e link para o PDF original no TSE.
4. Todas as candidaturas recebem tratamento simétrico: mesmos temas, mesmas regras, mesmo peso visual.

Viés editorial não é eliminável — é tornado **auditável**.

---

## 2. Unidade de análise: a proposta

### 2.1 Definição operacional

Registra-se como **proposta** todo trecho que satisfaça simultaneamente três critérios:

- **A1 — Compromisso de ação:** contém verbo que expressa fazer ("criar", "ampliar", "revogar", "zerar", "regulamentar", "duplicar", "garantir" seguido de ação).
- **A2 — Objeto identificável:** é possível dizer *o que* será feito.
- **A3 — Agente executivo federal:** a ação cabe à Presidência ou ao governo federal, diretamente ou por iniciativa legislativa.

### 2.2 Exclusões

Não são registrados como proposta:

- **Diagnósticos:** descrições de problemas ("o Brasil tem a maior carga tributária da América Latina").
- **Valores sem ação:** princípios abstratos ("defendemos a família", "acreditamos na livre iniciativa").
- **Críticas** a adversários ou a governos anteriores.
- **Compromissos de terceiros:** o que estados, municípios, mercado ou sociedade "deverão" fazer sem ação federal correspondente.

### 2.3 Casos-limite (regras de desempate)

- **Meta sem instrumento** ("acabar com a fome até 2030"): registra-se. O compromisso é o dado; a ausência de instrumento fica visível na própria citação — o leitor vê.
- **Frase com múltiplos compromissos independentes:** dividir em propostas separadas.
- **Mesma proposta repetida** em seções diferentes do plano: registrar uma vez, na ocorrência mais completa.
- **Proposta condicional** ("caso aprovado o novo marco..."): registra-se; a condição integra a citação.
- Todo caso-limite novo encontrado durante a codificação vira regra escrita nesta seção, com registro no changelog (§10).

---

## 3. Taxonomia de temas

Pré-registrada antes da leitura dos planos. **12 temas fixos + 1 residual.** Todo candidato aparece em todos os temas.

| # | Tema | Escopo (o que entra) |
|---|------|----------------------|
| 1 | Economia e impostos | política fiscal, tributação, inflação, juros, dívida pública, câmbio |
| 2 | Emprego e renda | mercado de trabalho, salário mínimo, qualificação profissional, empreendedorismo, MEI |
| 3 | Saúde | SUS, financiamento, filas, atenção básica, saúde mental, vigilância sanitária |
| 4 | Educação | educação básica, superior, técnica, creches, alfabetização, carreira docente, merenda |
| 5 | Segurança pública e justiça | policiamento, armas, sistema prisional, fronteiras, política de drogas, judiciário |
| 6 | Programas sociais e habitação | transferência de renda, combate à fome e à pobreza, habitação popular, segurança alimentar |
| 7 | Meio ambiente e clima | desmatamento, metas de emissões, biodiversidade, política climática, licenciamento ambiental |
| 8 | Infraestrutura e energia | transporte, energia (geração e matriz), saneamento, telecomunicações, obras |
| 9 | Agricultura e agronegócio | crédito rural, agricultura familiar, seguro rural, reforma agrária, exportação agro |
| 10 | Estado e instituições | reforma administrativa, combate à corrupção, privatizações, relações entre Poderes |
| 11 | Tecnologia, ciência e inovação | digitalização de serviços, IA, pesquisa, universidades enquanto produtoras de ciência |
| 12 | Política externa e defesa | relações internacionais, comércio exterior, Forças Armadas, soberania |
| 13 | Outros temas | residual: cultura, esporte, e o que não couber acima |

### 3.1 Regras de classificação

- Cada proposta recebe **exatamente um tema primário** (evita dupla contagem e assimetria).
- Tema primário = objeto principal da ação. Em empate, decide o beneficiário direto.
- **Fronteiras já resolvidas:** saneamento → 8; geração de energia → 8; metas de emissões → 7; merenda escolar → 4; segurança alimentar → 6; pesquisa universitária → 11; ensino universitário → 4; comércio exterior → 12; crédito rural → 9.
- Novas fronteiras são resolvidas uma vez, registradas aqui e aplicadas retroativamente a todos os planos.

---

## 4. Protocolo de extração (por plano)

1. **Captura:** baixar o PDF no DivulgaCandContas (TSE); registrar URL, data de captura e hash SHA-256 do arquivo.
2. **Primeira passada:** leitura integral, marcando todo trecho que aparente compromisso — sem classificar ainda. (Separar "achar" de "julgar" reduz erro.)
3. **Segunda passada:** aplicar A1–A3 a cada marcação; segmentar; atribuir tema; extrair citação e página.
4. **Passada de ausências:** para cada tema sem proposta registrada, verificar se o plano ao menos menciona o tema (distinção do §6).
5. **Revisão fria:** reler todas as entradas do plano no mínimo 48h depois, antes de publicar.

**Tempo simétrico:** orçamento de leitura semelhante para todos os planos, independente de afinidade pessoal com a candidatura. Registrar horas dedicadas por plano.

---

## 5. Regras de citação e resumo

- Citação = frase(s) completa(s) do original, **sem paráfrase**.
- Cortes marcados com `[...]`; erros do original preservados com `[sic]`.
- Nunca unir trechos de páginas ou seções diferentes numa mesma citação.
- Limite de ~500 caracteres exibidos; excedente acessível por "ver trecho completo".
- **Resumo é opcional** e, se existir, segue template fixo: *verbo no infinitivo + objeto + qualificadores presentes no texto*. Sem adjetivos, números ou promessas que não estejam no original. O resumo acompanha a citação; nunca a substitui.

---

## 6. Ausência como informação

Dois níveis, ambos verificáveis:

1. **"O plano não menciona este tema."**
2. **"O plano menciona o tema apenas como diagnóstico, sem apresentar proposta."** — com página da menção.

A distinção importa: silêncio total e diagnóstico sem compromisso são fatos diferentes, e ambos são objetivos.

---

## 7. Fonte canônica e versionamento

- Fonte única: o PDF protocolado no TSE (DivulgaCandContas). **Não** entram site de campanha, entrevistas, debates ou redes sociais — o plano registrado é o único documento com valor formal e igual para todos.
- Planos podem ser substituídos (substituição de candidatura, retificações): verificação semanal do hash; se o PDF mudar, recodificar as diferenças e registrar no changelog.
- **2º turno:** nenhuma regra muda; apenas filtra-se a exibição para as duas candidaturas.

---

## 8. Controles de qualidade e viés

- **Pré-registro:** este documento (taxonomia + regras) é publicado com data *antes* da codificação dos planos. Commit público datado serve de prova.
- **Auto-teste de consistência:** recodificar ~10% de um plano uma semana depois e comparar com a codificação original (test-retest). Divergências viram regras novas no §2.3 ou §3.1.
- **Revisor externo (se disponível):** segunda pessoa codifica uma amostra; divergências discutidas viram regras. É a versão informal da confiabilidade intercodificador da análise de conteúdo.
- **Contagens não são manchete:** o número de propostas por candidatura **não** aparece como métrica de comparação (quantidade ≠ qualidade e induz ranking). Fica restrito à página de metodologia.

---

## 9. Apresentação neutra

- **Ordem alfabética** de candidaturas em todas as telas — regra única, declarada na metodologia.
- **Simetria visual:** mesmos componentes, mesmo espaço, para todas as candidaturas.
- **Linguagem do site não adjetiva:** "propostas para a saúde", nunca "plano ousado para a saúde".
- Link para o PDF original acompanha toda citação.

---

## 10. Governança da metodologia

- Documento público, versionado e datado. Toda alteração entra num **changelog** com justificativa.
- Canal de contato para leitores apontarem erros; correções também registradas no changelog.
- Congelamento: após o início da codificação, a taxonomia (§3) não muda; apenas regras de fronteira e casos-limite podem ser adicionados.

### Changelog

- **0.1 (15/08/2026):** versão inicial.
