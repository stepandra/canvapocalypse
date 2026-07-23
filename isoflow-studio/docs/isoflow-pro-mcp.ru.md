# Isoflow Pro MCP: фактический контракт

Проверено 10 июля 2026 через уже авторизованный hosted connector `claude.ai isoflow` в Claude Code.

## Endpoint и OAuth

- MCP endpoint: `https://isoflow.io/api/mcp`
- Предварительно зарегистрированный OAuth client: `isoflow-mcp`
- Client secret: не используется.
- Isoflow запрещает Dynamic Client Registration (`403`).
- Client `isoflow-mcp` принимает только redirect URI Claude: `https://claude.ai/api/mcp/auth_callback`.
- Hermes использует собственный loopback callback, поэтому прямой OAuth login отклоняется как `invalid_redirect`.
- Авторизация hosted connector хранится в Claude.ai, а не как отдельный локальный Isoflow token в `~/.claude`; перенести её в Hermes невозможно.

Hermes может вызывать этот connector косвенно через уже авторизованный Claude Code CLI, но это модельный proxy, а не прямое MCP-подключение.

## Доступные tools

Сервер публикует ровно три инструмента:

1. `create-project`
2. `get-model-schema`
3. `get-available-icons`

MCP resources отсутствуют. Нет `list-projects`, `get-project`, `read-project`, `update-project` или `delete-project`. Поэтому MCP API не позволяет получить список текущих проектов или прочитать уже существующий проект. Фактически это create-only API.

## Фактическая модель `create-project`

Все top-level partials опциональны:

- `title`
- `c4`
- `physicalTopology`
- `documents`

На всех структурных объектах выставлено `additionalProperties: false`: произвольные metadata поля не принимаются.

### C4

- `blocks[]`: `id`, `name`, `type`, опциональные `description`, `children`.
- Типы block: `PLACEHOLDER`, `GROUP`, `PERSON`, `SOFTWARE_SYSTEM`, `CONTAINER`, `COMPONENT`, `CODE`.
- `relationships[]`: `id`, `source`, `target`, опциональный `description` до 3000 символов.
- `views[]`: `id`, `name`, ссылки на block/relationship IDs.

### Physical topology

- `components[]`: только `id`, `name`, опциональный `icon`.
- `views[]`: `id`, `name`, `items`, `connectors`, опциональные `rectangles`, `textBoxes`.
- View item: `id`, component ID и `tile: {x, y}`.
- Connector: только `source`, `destination`; нет ID, label, description или metadata.

### Documents

Документы представлены ProseMirror JSON и поддерживают:

- headings 1–3;
- paragraphs;
- bullet/ordered lists;
- blockquotes;
- code blocks;
- horizontal rules;
- `itemReference`.

`itemReference` может ссылаться на:

- `c4.view`
- `c4.block`
- `c4.relationship`
- `physicalTopology.view`
- `physicalTopology.component`

Это полезный механизм для связи narrative ↔ diagram, но не замена структурированному evidence/provenance graph.

## Вывод для Isoflow Studio

1. Репозиторные спецификации и структурированные модели остаются source of truth.
2. C4 IDs можно синхронизировать со stable component IDs.
3. Markdown narrative можно проецировать в `documents` и связывать через `itemReference`.
4. Evidence, source locations, confidence и typed edge metadata должны оставаться в sidecar data: MCP schema не имеет для них полей.
5. Physical topology годится как layout projection, но его connectors слишком бедны для canonical dependency graph.
6. Для чтения существующих проектов нужен новый tool со стороны Isoflow (`list/get/export-project`) либо отдельный authenticated REST/export API.
