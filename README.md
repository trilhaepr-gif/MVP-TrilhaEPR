Trilha EPR - Sistema de Apoio à Decisão (SAD)

![Python](https://img.shields.io/badge/Python-3.9+-blue.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.95+-009688.svg)
![NLP](https://img.shields.io/badge/NLP-MiniLM--L12--v2-orange.svg)
![Vanilla JS](https://img.shields.io/badge/Frontend-Vanilla_JS-F7DF1E.svg)
![Status](https://img.shields.io/badge/Status-MVP_Ativo-success.svg)

Sobre o Projeto

O **Trilha EPR** é um Sistema de Apoio à Decisão (SAD) desenvolvido para resolver um problema complexo de Pesquisa Operacional e Gestão Acadêmica: a otimização de grades horárias e a recomendação estratégica de disciplinas optativas para estudantes de Engenharia de Produção (Universidade de Brasília - UnB).

Diferente de sistemas tradicionais de montagem de horários baseados apenas em tentativa e erro, este projeto utiliza **Processamento de Linguagem Natural (NLP)** para analisar o alinhamento semântico entre o plano de carreira do estudante e as ementas das disciplinas, acoplado a um motor heurístico que evita choques de horário e prioriza turnos ergonômicos (noturno).

---

Funcionalidades Principais

Motor de Recomendação Semântica (NLP):** Utiliza o modelo *MiniLM-L12-v2* para criar *Embeddings* vetoriais do catálogo de disciplinas (Nome + Área + Ementa). Calcula a Similaridade de Cosseno entre a intenção do aluno (ex: "Logística") e as matérias.
Otimizador Combinatório (Mesh Collision):** Algoritmo de validação de interseção de conjuntos que impede colisões de horários (ex: 24N34 vs 46N34), garantindo a viabilidade operacional da grade.
Heurística de Custo:** Penaliza turnos matutinos/vespertinos e favorece turmas noturnas, respeitando a realidade do aluno trabalhador/estagiário.
Dashboard Interativo (Smart UI):** Interface web iterativa com recursos de *Smart Sticky Header*, manipulação de "Pílulas Dinâmicas" para troca de turmas em tempo real e exportação da grade consolidada para PNG.

---

Arquitetura do Sistema

O projeto foi estruturado em um padrão *Client-Server* ágil e leve, dispensando *frameworks* pesados no Frontend para focar no processamento do Backend.

* **Backend (O Motor Lógico):** Desenvolvido em Python utilizando `FastAPI`. Hospeda a lógica de otimização, a base de dados (`disciplinas.csv`) gerida via `Pandas`, e o pipeline de *Deep Learning* (`sentence-transformers`).
* **Frontend (A Interface de Decisão):** Construído em Vanilla JavaScript, HTML5 e CSS3. Consome a API do backend de forma assíncrona.
* **Base de Dados Proprietária:** Dataset estruturado a partir da raspagem e limpeza do catálogo oficial do SIGAA/UnB.

---

Como Executar Localmente

1. Clonar o repositório
```bash
git clone [https://github.com/SEU_USUARIO/trilha-epr.git](https://github.com/SEU_USUARIO/trilha-epr.git)
cd trilha-epr
