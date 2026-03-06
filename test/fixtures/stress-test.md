# Stress Test: Every Markdown Format

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

## Inline Formatting Showcase

This paragraph has **bold text**, *italic text*, ***bold italic***, ~~strikethrough~~, `inline code`, and [a hyperlink](https://example.com). Here's more: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

### Nested Emphasis

**This is bold with *italic inside* and `code` too.** And *this is italic with **bold** nested*.

## Blockquotes

> Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

> > Nested blockquote: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

> > > Triple nested: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

> 
> — Someone Famous

## Unordered Lists

- Item 1: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
- Item 2: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
- Item 3: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
- Item 4: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
- Item 5: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

Nested list:

- Top level item
  - Second level with **bold**
    - Third level with `code`
      - Fourth level deep nesting
  - Another second level
- Back to top

## Ordered Lists

1. Step 1: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
2. Step 2: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
3. Step 3: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
4. Step 4: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
5. Step 5: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
6. Step 6: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
7. Step 7: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
8. Step 8: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

### Mixed List

1. First ordered
   - Unordered child
   - Another child
2. Second ordered
   1. Nested ordered
   2. Another nested
3. Third with `inline code` and **bold**

## Task List

- [x] Completed task with **formatting**
- [ ] Pending task
- [x] Another done task
- [ ] Yet another pending: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

## Code Blocks

### TypeScript

```typescript
interface Config {
  host: string
  port: number
  debug: boolean
  tags: string[]
}

async function fetchData<T>(url: string, config: Config): Promise<T> {
  const response = await fetch(`${url}:${config.port}`, {
    headers: { 'X-Debug': String(config.debug) },
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  return response.json() as Promise<T>
}

const CONFIG: Config = {
  host: 'localhost',
  port: 3000,
  debug: true,
  tags: ['api', 'v2', 'beta'],
}

// generic type usage
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E }

```

### Python

```python
from dataclasses import dataclass
from typing import Optional
import asyncio

@dataclass
class User:
    name: str
    email: str
    age: Optional[int] = None

    def greet(self) -> str:
        return f"Hello, {self.name}!"

async def process_users(users: list[User]) -> dict[str, int]:
    results = {}
    for user in users:
        await asyncio.sleep(0.1)  # simulate work
        results[user.name] = len(user.email)
    return results

if __name__ == "__main__":
    users = [User("Alice", "alice@example.com", 30), User("Bob", "bob@test.io")]
    counts = asyncio.run(process_users(users))
    print(counts)

```

### Rust

```rust
use std::collections::HashMap;

#[derive(Debug, Clone)]
struct Document {
    title: String,
    content: String,
    tags: Vec<String>,
}

impl Document {
    fn new(title: &str, content: &str) -> Self {
        Self {
            title: title.to_string(),
            content: content.to_string(),
            tags: Vec::new(),
        }
    }

    fn word_count(&self) -> usize {
        self.content.split_whitespace().count()
    }
}

fn build_index(docs: &[Document]) -> HashMap<String, Vec<usize>> {
    let mut index: HashMap<String, Vec<usize>> = HashMap::new();
    for (i, doc) in docs.iter().enumerate() {
        for tag in &doc.tags {
            index.entry(tag.clone()).or_default().push(i);
        }
    }
    index
}

```

### Shell

```bash
#!/bin/bash
set -euo pipefail

readonly LOG_FILE="/var/log/deploy.log"

log() { echo "[$(date -Iseconds)] $*" | tee -a "$LOG_FILE"; }

deploy() {
    local env="${1:?Usage: deploy <env>}"
    log "Starting deployment to $env"

    git pull origin main
    npm ci --production
    npm run build

    if [[ "$env" == "production" ]]; then
        log "Running migrations..."
        npm run db:migrate
    fi

    pm2 restart all
    log "Deployment complete"
}

deploy "$@"

```

### JSON

```json
{
  "name": "liham",
  "version": "2.0.0",
  "dependencies": {
    "@opentui/core": "^0.5.0",
    "@opentui/react": "^0.5.0",
    "unified": "^11.0.0"
  },
  "scripts": {
    "build": "bun build src/cli/index.ts --outdir dist",
    "test": "bun test",
    "lint": "eslint src/"
  }
}

```

## Tables

### Simple Table

| Feature | Status | Priority | Notes |
|---------|--------|----------|-------|
| File browser | Done | High | Phase 4 |
| Fuzzy filter | Done | High | fzf-style |
| Live preview | Done | Medium | Cache-first |
| File watcher | Pending | Medium | Phase 5 |
| Kitty graphics | Pending | Low | Phase 6 |

### Wide Table with Long Content

| Method | Endpoint | Description | Auth | Rate Limit |
|--------|----------|-------------|------|------------|
| GET | `/api/v2/users` | List all users with pagination and filtering | Bearer token | 100/min |
| POST | `/api/v2/users` | Create a new user account with email verification | Bearer token | 20/min |
| PUT | `/api/v2/users/:id` | Update user profile including avatar and preferences | Bearer token | 50/min |
| DELETE | `/api/v2/users/:id` | Soft-delete user account with 30-day recovery window | Admin only | 10/min |
| GET | `/api/v2/users/:id/activity` | Retrieve user activity log with date range filtering | Bearer token | 30/min |

## Thematic Breaks

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

---

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

***

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

## Links and Images

- [GitHub](https://github.com)
- [Rust Book](https://doc.rust-lang.org/book/)
- [MDN Web Docs](https://developer.mozilla.org)

![Placeholder image](https://via.placeholder.com/600x200)

[![Clickable image link](https://via.placeholder.com/100x30)](https://example.com)

## Heading Levels

# Heading 1

## Heading 2

### Heading 3

#### Heading 4

##### Heading 5

###### Heading 6

## Dense Paragraphs for Scroll Testing

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

## Complex Nesting

> Here is a blockquote containing a code block:
>
> ```javascript
> function fibonacci(n) {
>   if (n <= 1) return n
>   return fibonacci(n - 1) + fibonacci(n - 2)
> }
> ```
>
> And a list inside the quote:
>
> 1. First item
> 2. Second item
>    - Nested bullet
> 3. Third item

## Code-Heavy Paragraph

The `processMarkdown()` function calls `remark.parse()` to generate an `mdast` tree, then `remark-rehype` converts it to `hast`, which `rehype-highlight` annotates with `<span class="hljs-*">` tokens. The `rehype-ir` compiler walks the `hast` tree and emits `IRNode[]` — a discriminated union of `HeadingNode`, `ParagraphNode`, `CodeBlockNode`, `BlockquoteNode`, `ListNode`, `TableNode`, `ThematicBreakNode`, and `CustomNode<string>`. Finally `renderToOpenTUI()` maps each `IRNode` to the appropriate React component.

## The End

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

---

*Generated by `scripts/gen-stress-test.ts` for liham preview stress testing.*
