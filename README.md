# Gerência de Redes: Observabilidade e Simulação de Incidentes

## 📋 Descrição do Projeto
Este repositório contém a implementação da **Prática 01** da disciplina de **Gerência de Redes** do curso de **Engenharia de Computação**, sob a orientação do **Prof. Douglas F. S. Nunes**. 

O objetivo principal do projeto é projetar, implementar e analisar um ambiente de observabilidade moderna utilizando containers Docker. O foco está no monitoramento centralizado, análise de telemetria (métricas e logs) e resposta a incidentes em tempo real aplicados a uma aplicação web estruturada.

---

## 🚧 Status do Projeto
> **⚠️ ESTADO ATUAL: EM FASE DE ESTRUTURAÇÃO**
> O projeto encontra-se na fase inicial de design de arquitetura e configuração de ambiente. Os arquivos de configuração base, o esqueleto da aplicação e a orquestração inicial dos serviços estão sendo estruturados.

---

## 🎯 Objetivos de Aprendizagem
Ao concluir este projeto, a equipe será capaz de:
* Implementar uma stack completa de observabilidade em ambiente containerizado.
* Coletar, centralizar e analisar métricas de infraestrutura e logs de aplicação.
* Criar dashboards profissionais e intuitivos no Grafana.
* Detectar, investigar e mitigar incidentes reais de TI.
* Correlacionar picos de consumo de recursos com falhas no código (Métricas ↔ Logs).
* Aplicar conceitos práticos de *Site Reliability Engineering* (SRE), como SLIs e taxas de erro.

---

## 🧱 Requisitos do Projeto & Arquitetura

### 📦 1. Infraestrutura e Stack de Observabilidade
O ambiente deve ser totalmente orquestrado via **Docker Compose**, contendo obrigatoriamente os seguintes componentes:
* **Aplicação Web:** API Node.js simulando o serviço de produção.
* **Prometheus:** Coleta e armazenamento de métricas baseadas em séries temporais.
* **Node Exporter:** Coleta de métricas de hardware e do sistema operacional hospedeiro.
* **Loki:** Sistema de agregação de logs focado em alta escalabilidade.
* **Promtail:** Agente responsável por coletar e enviar os logs locais para o Loki.
* **Grafana:** Plataforma de análise e visualização para a criação dos dashboards.

### 💻 2. Requisitos da Aplicação (Node.js)
A aplicação alvo deve consistir em um serviço web funcional contendo:
* Sistema de cadastro de usuários (CRUD completo).
* Mecanismo de autenticação/login.
* Geração de logs estruturados utilizando saída padrão (`console.log` / `console.error`).
* **Endpoints Obrigatórios:**
    * `POST /register` — Cadastro de novos usuários
    * `POST /login` — Autenticação no sistema
    * `GET /users` — Listagem de usuários
    * `PUT /users/:id` — Atualização de dados cadastrais
    * `DELETE /users/:id` — Remoção de usuários

---

## 📊 Plano de Observabilidade

### Métricas (Prometheus)
* **Infraestrutura:** Monitoramento de uso de CPU, Memória, Redes e Armazenamento.
* **Disponibilidade:** Verificação de *uptime* e status de saúde dos serviços.

### Logs (Loki + Promtail)
* Rastreamento do fluxo de requisições HTTP recebidas pela aplicação.
* Monitoramento detalhado de falhas de autenticação (erros de login).
* Captura de exceções e erros internos do sistema (Erros 500).

---

## 🎨 Design do Dashboard (Grafana)
O painel de controle será dividido em três blocos lógicos estruturados da seguinte forma:

1.  **🟦 BLOCO 1 — Infraestrutura:** Painéis com consumo de CPU, memória RAM e tráfego de rede (In/Out).
2.  **🟩 BLOCO 2 — Aplicação:** Volume total de logs recebidos, taxa de erros percentual (`Error Rate %` - *Requisito Obrigatório*) e stream de logs em tempo real.
3.  **🟥 BLOCO 3 — Incidentes:** Contador de erros agregados por minuto, identificação visual de picos de falha e painel comparativo correlacionando o uso de CPU com a ocorrência de erros.

---

## 🔥 Cenários de Incidentes para Simulação
Durante as validações práticas, serão simulados e analisados obrigatoriamente três cenários críticos de incidentes:
* **🔴 Incidente 1 — Alta Taxa de Erro:** Indução de falhas consecutivas no endpoint de login e geração em massa de respostas HTTP 500.
* **🔴 Incidente 2 — Sobrecarga:** Geração de um loop de requisições pesadas simulando um ataque de negação de serviço ou vazamento de recursos, gerando estouro no uso de CPU.
* **🔴 Incidente 3 — Instabilidade:** Simulação de problemas intermitentes na rede, gerando atrasos (*delays*), *timeouts* e logs de erro inconsistentes.

---

## 📅 Entregáveis e Cronograma
* **Código-Fonte Completo:** Repositório com `docker-compose.yml`, códigos da aplicação e arquivos de configuração (`.yml`, `.ini`, etc.) compactados via Google Sala de Aula.
* **Dashboard Exportado:** Arquivo `.json` contendo as configurações de painéis criadas no Grafana.
* **Demonstração Prática:** Apresentação em laboratório agendada para os dias **13/05** e **27/05**, focando na execução e análise dos incidentes em tempo real.

---

## 🧮 Critérios de Avaliação (Total: 5.0 pontos)
| Critério | Peso | Descrição |
| :--- | :---: | :--- |
| **Configuração do Ambiente** | 20% | Orquestração correta de todos os containers via Docker Compose. |
| **Coleta de Métricas e Logs** | 20% | Sucesso no fluxo de telemetria da aplicação e hosts até as bases de dados. |
| **Qualidade do Dashboard** | 30% | Clareza visual, conformidade com os blocos pedidos e inclusão de métrica percentual. |
| **Simulação de Incidentes** | 30% | Capacidade de reproduzir os cenários e explicá-los através dos gráficos. |

---
*Documento atualizado em 18/05/2026.*