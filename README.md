# Laboratório de Observabilidade

API Node.js para práticas de engenharia de confiabilidade e observabilidade, integrada a uma stack completa de monitoramento.

## Visão Geral do Sistema
O projeto consiste em uma aplicação de gerenciamento de usuários (CRUD) com autenticação JWT, desenvolvida para servir como ambiente controlado para o estudo de métricas, logs e tracing. A aplicação simula cenários do mundo real, incluindo endpoints específicos para induzir falhas e gargalos de performance.

**Público-alvo:** Estudantes de Engenharia de Software, SRE e DevOps.

## Arquitetura e Componentes Gerais

O sistema é composto por uma arquitetura de micro-serviços contida, orquestrada via Docker Compose:

### Diagrama de Fluxo
- **Aplicação (Node.js):** Executa a lógica de negócio, expõe métricas Prometheus e grava logs estruturados em JSON.
- **Prometheus:** Realiza o *scrape* das métricas expostas pela aplicação e pelo Node Exporter.
- **Promtail:** Coleta os logs gravados em arquivo pela aplicação e os envia para o Loki.
- **Loki:** Sistema de agregação de logs.
- **Grafana:** Dashboard central para visualização de métricas (Prometheus) e logs (Loki).
- **Node Exporter:** Coleta métricas de hardware e do sistema operacional host.

### Tecnologias Utilizadas
- **Runtime:** Node.js v18 (Alpine)
- **Framework:** Express.js
- **Banco de Dados:** SQLite (via `better-sqlite3`)
- **Autenticação:** JSON Web Token (JWT) e BcryptJS
- **Monitoramento:** Prometheus, Grafana, Loki, Promtail

## Pré-requisitos
- Docker e Docker Compose (recomendado)
- Node.js 18.x ou superior (para execução local sem Docker)
- Cliente HTTP (Postman, Insomnia ou cURL)

## Instruções de Execução

### Via Docker Compose (Recomendado)
Para subir toda a stack (Aplicação + Monitoramento):

```bash
docker-compose up -d
```

Após a inicialização, os serviços estarão disponíveis em:
- **Aplicação:** http://localhost:3000
- **Grafana:** http://localhost:3001 (Dashboards pré-configurados disponíveis)
- **Prometheus:** http://localhost:9090

### Execução Local (Desenvolvimento)
Para rodar apenas a aplicação Node.js:

1. Acesse o diretório da aplicação:
   ```bash
   cd app
   ```
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Configure as variáveis de ambiente (veja seção abaixo).
4. Inicie o servidor:
   ```bash
   npm run dev
   ```

### Variáveis de Ambiente
A aplicação utiliza as seguintes variáveis (configuradas no `docker-compose.yml` ou via arquivo `.env`):

| Variável | Descrição | Valor Exemplo |
| :--- | :--- | :--- |
| `PORT` | Porta de escuta da API | `3000` |
| `JWT_SECRET` | Chave secreta para assinatura de tokens | `chave-secreta-para-demo` |
| `NODE_ENV` | Ambiente de execução | `production` ou `development` |

## Estrutura de Diretórios
```text
.
├── app/                  # Código-fonte da API Node.js
│   ├── data/             # Banco de Dados SQLite (persistente)
│   ├── logs/             # Logs da aplicação (coletados pelo Promtail)
│   ├── Dockerfile        # Definição da imagem da aplicação
│   └── server.js         # Entrypoint e lógica principal
├── monitoring/           # Configurações da Stack de Observabilidade
│   ├── grafana/          # Dashboards e Data Sources
│   ├── loki/             # Configuração de agregação de logs
│   ├── prometheus/       # Regras de scrape de métricas
│   └── promtail/         # Configuração de coleta de logs
└── docker-compose.yml    # Orquestração de todos os serviços
```

## API / Interface

### Endpoints de Negócio
- `POST /register`: Criação de novo usuário.
- `POST /login`: Autenticação e geração de token JWT.
- `GET /users`: Listagem de usuários (Requer JWT).
- `PUT /users/:id`: Atualização de e-mail (Requer JWT).
- `DELETE /users/:id`: Remoção de usuário (Requer JWT).

### Endpoints de Observabilidade e Diagnóstico
- `GET /health`: Status de saúde da aplicação.
- `GET /metrics`: Métricas no formato Prometheus.

### Simulação de Incidentes
Utilizados para gerar dados nos dashboards e testar alertas:
- `GET /simulate-error`: Retorna erro 500 em 50% das requisições.
- `GET /simulate-cpu`: Gera um pico de processamento (loop intensivo) por ~2 segundos.
- `GET /simulate-delay`: Simula uma resposta lenta com timeout de 5 segundos.

## Estado Atual e Limitações Conhecidas
- **Funcional:** Autenticação, CRUD básico, métricas de latência/taxa de erro e integração de logs.
- **Observabilidade:** Dashboards do Grafana são provisionados automaticamente via arquivos JSON em `monitoring/grafana/dashboard_files/`.
- **Débito Técnico:** A aplicação utiliza um modelo monolítico simplificado em um único arquivo (`server.js`).
- **Persistência:** O banco SQLite é persistido via volume no host.

## Contribuição
1. Certifique-se de que todas as dependências estão instaladas.
2. Siga o padrão de Commits Semânticos.
3. Antes de submeter um PR, valide a execução local e via Docker.

## Licença
A definir.
