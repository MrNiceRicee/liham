// generates a dense markdown stress test file exercising every format liham supports

const lorem = [
	'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
	'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
	'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
	'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
	'Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam.',
	'Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores.',
	'Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit.',
	'Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur.',
]

function pick(arr: string[], n: number): string[] {
	return Array.from({ length: n }, (_, i) => arr[i % arr.length]!)
}

function paragraph(n = 3): string {
	return pick(lorem, n).join(' ')
}

const sections: string[] = []

// title
sections.push('# Stress Test: Every Markdown Format\n')
sections.push(paragraph(2) + '\n')

// h2 with inline formatting
sections.push('## Inline Formatting Showcase\n')
sections.push(`This paragraph has **bold text**, *italic text*, ***bold italic***, ~~strikethrough~~, \`inline code\`, and [a hyperlink](https://example.com). Here's more: ${paragraph(1)}\n`)

// h3 nested
sections.push('### Nested Emphasis\n')
sections.push('**This is bold with *italic inside* and `code` too.** And *this is italic with **bold** nested*.\n')

// blockquote
sections.push('## Blockquotes\n')
sections.push('> ' + paragraph(1) + '\n')
sections.push('> > Nested blockquote: ' + pick(lorem, 1)[0] + '\n')
sections.push('> > > Triple nested: ' + pick(lorem, 1)[0] + '\n')
sections.push('> \n> — Someone Famous\n')

// unordered list
sections.push('## Unordered Lists\n')
for (let i = 0; i < 5; i++) {
	sections.push(`- Item ${i + 1}: ${pick(lorem, 1)[0]}`)
}
sections.push('')
sections.push('Nested list:\n')
sections.push('- Top level item')
sections.push('  - Second level with **bold**')
sections.push('    - Third level with `code`')
sections.push('      - Fourth level deep nesting')
sections.push('  - Another second level')
sections.push('- Back to top\n')

// ordered list
sections.push('## Ordered Lists\n')
for (let i = 1; i <= 8; i++) {
	sections.push(`${String(i)}. Step ${String(i)}: ${pick(lorem, 1)[0]}`)
}
sections.push('')

// mixed list
sections.push('### Mixed List\n')
sections.push('1. First ordered')
sections.push('   - Unordered child')
sections.push('   - Another child')
sections.push('2. Second ordered')
sections.push('   1. Nested ordered')
sections.push('   2. Another nested')
sections.push('3. Third with `inline code` and **bold**\n')

// task list (GFM)
sections.push('## Task List\n')
sections.push('- [x] Completed task with **formatting**')
sections.push('- [ ] Pending task')
sections.push('- [x] Another done task')
sections.push('- [ ] Yet another pending: ' + pick(lorem, 1)[0])
sections.push('')

// code blocks in multiple languages
sections.push('## Code Blocks\n')
sections.push('### TypeScript\n')
sections.push('```typescript')
sections.push(`interface Config {
  host: string
  port: number
  debug: boolean
  tags: string[]
}

async function fetchData<T>(url: string, config: Config): Promise<T> {
  const response = await fetch(\`\${url}:\${config.port}\`, {
    headers: { 'X-Debug': String(config.debug) },
  })
  if (!response.ok) {
    throw new Error(\`HTTP \${response.status}: \${response.statusText}\`)
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
`)
sections.push('```\n')

sections.push('### Python\n')
sections.push('```python')
sections.push(`from dataclasses import dataclass
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
`)
sections.push('```\n')

sections.push('### Rust\n')
sections.push('```rust')
sections.push(`use std::collections::HashMap;

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
`)
sections.push('```\n')

sections.push('### Shell\n')
sections.push('```bash')
sections.push(`#!/bin/bash
set -euo pipefail

readonly LOG_FILE="/var/log/deploy.log"

log() { echo "[$(date -Iseconds)] $*" | tee -a "$LOG_FILE"; }

deploy() {
    local env="\${1:?Usage: deploy <env>}"
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
`)
sections.push('```\n')

sections.push('### JSON\n')
sections.push('```json')
sections.push(`{
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
`)
sections.push('```\n')

// tables
sections.push('## Tables\n')
sections.push('### Simple Table\n')
sections.push('| Feature | Status | Priority | Notes |')
sections.push('|---------|--------|----------|-------|')
sections.push('| File browser | Done | High | Phase 4 |')
sections.push('| Fuzzy filter | Done | High | fzf-style |')
sections.push('| Live preview | Done | Medium | Cache-first |')
sections.push('| File watcher | Pending | Medium | Phase 5 |')
sections.push('| Kitty graphics | Pending | Low | Phase 6 |')
sections.push('')

sections.push('### Wide Table with Long Content\n')
sections.push('| Method | Endpoint | Description | Auth | Rate Limit |')
sections.push('|--------|----------|-------------|------|------------|')
sections.push('| GET | `/api/v2/users` | List all users with pagination and filtering | Bearer token | 100/min |')
sections.push('| POST | `/api/v2/users` | Create a new user account with email verification | Bearer token | 20/min |')
sections.push('| PUT | `/api/v2/users/:id` | Update user profile including avatar and preferences | Bearer token | 50/min |')
sections.push('| DELETE | `/api/v2/users/:id` | Soft-delete user account with 30-day recovery window | Admin only | 10/min |')
sections.push('| GET | `/api/v2/users/:id/activity` | Retrieve user activity log with date range filtering | Bearer token | 30/min |')
sections.push('')

// thematic breaks
sections.push('## Thematic Breaks\n')
sections.push(paragraph(1) + '\n')
sections.push('---\n')
sections.push(paragraph(1) + '\n')
sections.push('***\n')
sections.push(paragraph(1) + '\n')

// images and links
sections.push('## Links and Images\n')
sections.push('- [GitHub](https://github.com)')
sections.push('- [Rust Book](https://doc.rust-lang.org/book/)')
sections.push('- [MDN Web Docs](https://developer.mozilla.org)\n')
sections.push('![Placeholder image](https://via.placeholder.com/600x200)\n')
sections.push('[![Clickable image link](https://via.placeholder.com/100x30)](https://example.com)\n')

// headings h1-h6
sections.push('## Heading Levels\n')
sections.push('# Heading 1\n')
sections.push('## Heading 2\n')
sections.push('### Heading 3\n')
sections.push('#### Heading 4\n')
sections.push('##### Heading 5\n')
sections.push('###### Heading 6\n')

// long paragraphs for scroll testing
sections.push('## Dense Paragraphs for Scroll Testing\n')
for (let i = 0; i < 10; i++) {
	sections.push(paragraph(4) + '\n')
}

// deeply nested blockquote with code
sections.push('## Complex Nesting\n')
sections.push('> Here is a blockquote containing a code block:\n>')
sections.push('> ```javascript')
sections.push('> function fibonacci(n) {')
sections.push('>   if (n <= 1) return n')
sections.push('>   return fibonacci(n - 1) + fibonacci(n - 2)')
sections.push('> }')
sections.push('> ```')
sections.push('>')
sections.push('> And a list inside the quote:')
sections.push('>')
sections.push('> 1. First item')
sections.push('> 2. Second item')
sections.push('>    - Nested bullet')
sections.push('> 3. Third item\n')

// inline code heavy paragraph
sections.push('## Code-Heavy Paragraph\n')
sections.push('The `processMarkdown()` function calls `remark.parse()` to generate an `mdast` tree, then `remark-rehype` converts it to `hast`, which `rehype-highlight` annotates with `<span class="hljs-*">` tokens. The `rehype-ir` compiler walks the `hast` tree and emits `IRNode[]` — a discriminated union of `HeadingNode`, `ParagraphNode`, `CodeBlockNode`, `BlockquoteNode`, `ListNode`, `TableNode`, `ThematicBreakNode`, and `CustomNode<string>`. Finally `renderToOpenTUI()` maps each `IRNode` to the appropriate React component.\n')

// final section
sections.push('## The End\n')
sections.push(paragraph(2) + '\n')
sections.push('---\n')
sections.push('*Generated by `scripts/gen-stress-test.ts` for liham preview stress testing.*\n')

const output = sections.join('\n')
const dest = `${import.meta.dir}/../test/fixtures/stress-test.md`
await Bun.write(dest, output)

const lines = output.split('\n').length
const bytes = new TextEncoder().encode(output).length
console.log(`wrote ${dest}`)
console.log(`${lines} lines, ${bytes} bytes`)
