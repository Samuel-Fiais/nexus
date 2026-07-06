# Nexus

Robô de dúvidas no Slack — sistema RAG com LLM para responder perguntas baseadas em documentos internos.

## Stack

- **.NET 8** — ASP.NET Core Web API + workers
- **EF Core** — SQLite (dev), Postgres (produção futura)
- **DeepSeek** — provedor LLM para embeddings e respostas
- **Scalar** — documentação da API
- **Slack** — interface de perguntas e respostas
- **Docker** — deploy via container

## Arquitetura

```
┌─────────────┐     ┌──────────┐     ┌─────────────┐
│   Slack     │────▶│ Nexus.Api│────▶│   DeepSeek  │
│ (usuário)   │     │  (API)   │     │   (LLM)     │
└─────────────┘     └────┬─────┘     └─────────────┘
                         │
                    ┌────▼─────┐     ┌─────────────┐
                    │  Nexus   │     │  Knowledge  │
                    │ Persist. │◀────│  Sources    │
                    │ (SQLite) │     │ (Docs/Web)  │
                    └──────────┘     └─────────────┘
```

## Projetos

| Projeto | Função |
|---------|--------|
| `Nexus.Api` | API REST — endpoints Slack, admin, conhecimento |
| `Nexus.Application` | Casos de uso, ingestão, tags, orquestração |
| `Nexus.Domain` | Entidades de domínio |
| `Nexus.Persistence` | EF Core, migrations, busca vetorial |
| `Nexus.Llm` | Provider agnóstico de LLM |
| `Nexus.Slack` | Integração com Slack |
| `Nexus.Worker` | Workers de sincronização e retenção |
| `Nexus.KnowledgeSources` | Providers de conhecimento (pasta local, web) |

## Desenvolvimento

```bash
# Restaurar pacotes
dotnet restore

# Rodar migrations
dotnet ef database update -p src/Nexus.Persistence -s src/Nexus.Api

# Rodar API
cd src/Nexus.Api && dotnet run
```

API disponível em `http://localhost:5000`, documentação Scalar em `/scalar/v1`.

## Docker

```bash
docker compose up -d
```

Expõe a API na porta 5000. Configure variáveis de ambiente via `.env`.
