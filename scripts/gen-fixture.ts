// generates markdown playground fixtures for liham.
//
// usage:
//   bun scripts/gen-fixture.ts media      → sandbox/media-test.md
//   bun scripts/gen-fixture.ts stress     → sandbox/stress-test.md
//   bun scripts/gen-fixture.ts all        → both

import { mkdirSync, readdirSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { parseArgs } from 'node:util'

const SANDBOX_DIR = `${import.meta.dir}/../sandbox`
const ASSETS_DIR = `${import.meta.dir}/../test/assets`

// -- asset discovery --

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'])
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.avi', '.mkv'])
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a'])

interface AssetMap {
	images: string[]
	videos: string[]
	audio: string[]
}

function discoverAssets(): AssetMap {
	const files = readdirSync(ASSETS_DIR).sort((a, b) => a.localeCompare(b))
	const assets: AssetMap = { images: [], videos: [], audio: [] }
	for (const file of files) {
		const ext = extname(file).toLowerCase()
		if (IMAGE_EXTS.has(ext)) assets.images.push(file)
		else if (VIDEO_EXTS.has(ext)) assets.videos.push(file)
		else if (AUDIO_EXTS.has(ext)) assets.audio.push(file)
	}
	return assets
}

function altFromFilename(file: string): string {
	return basename(file, extname(file)).replaceAll(/[-_]/g, ' ')
}

// -- shared helpers --

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

async function writeFixture(name: string, content: string) {
	mkdirSync(SANDBOX_DIR, { recursive: true })
	const dest = `${SANDBOX_DIR}/${name}`
	await Bun.write(dest, content)
	const lines = content.split('\n').length
	const bytes = new TextEncoder().encode(content).length
	console.log(`  ${dest} (${lines} lines, ${bytes} bytes)`)
}

// -- media test fixture --

function generateMediaTest(): string {
	const s: string[] = []
	const assets = discoverAssets()

	s.push('# Media Rendering Test\n')
	s.push(
		'Exercises images, video, audio, missing files, remote URLs, and mixed content.\n',
	)

	// images — one section per discovered image
	if (assets.images.length > 0) {
		s.push('## Images\n')
		for (const file of assets.images) {
			const ext = extname(file).replace('.', '').toUpperCase()
			s.push(`### ${ext}\n`)
			s.push(`![${altFromFilename(file)}](../test/assets/${file})\n`)
		}
	}

	// video — one section per discovered video
	if (assets.videos.length > 0) {
		s.push('## Video\n')
		for (const file of assets.videos) {
			s.push(`![${altFromFilename(file)}](../test/assets/${file})\n`)
		}
	}

	// audio — one section per discovered audio
	if (assets.audio.length > 0) {
		s.push('## Audio\n')
		for (const file of assets.audio) {
			s.push(`![${altFromFilename(file)}](../test/assets/${file})\n`)
		}
	}

	// missing / error states
	s.push('## Missing Media\n')
	s.push('![missing image](../test/assets/nonexistent.png)\n')
	s.push('![missing video](../test/assets/nonexistent.mp4)\n')

	// remote image
	s.push('## Remote Image\n')
	s.push(
		'![bluesky post](https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:fcdgfml46uokazqoouqhepla/bafkreibc2lmdkfdruahkcehmi6nserlvohx2odkn4gj2op6qcl3ygzmq4i)\n',
	)

	// mixed content — use first image if available
	const firstImage = assets.images[0]
	if (firstImage != null) {
		s.push('## Mixed Content\n')
		s.push(
			'Here is a paragraph before an image. It has **bold** and `inline code` to verify layout.\n',
		)
		s.push(`![${altFromFilename(firstImage)}](../test/assets/${firstImage})\n`)
		s.push(
			'And here is text after the image. The image should be a block between these paragraphs.\n',
		)

		// multiple media in sequence — all discovered assets
		s.push('## All Media\n')
		for (const file of [...assets.images, ...assets.videos, ...assets.audio]) {
			s.push(`![${altFromFilename(file)}](../test/assets/${file})\n`)
		}

		// image in blockquote
		s.push('## Image in Blockquote\n')
		s.push('> Here is a quoted image:\n>')
		s.push(`> ![${altFromFilename(firstImage)}](../test/assets/${firstImage})\n`)

		// image with empty alt
		s.push('## Image with Empty Alt\n')
		s.push(`![](../test/assets/${firstImage})\n`)
	}

	// path traversal — should be rejected
	s.push('## Path Traversal (should fail)\n')
	s.push('![sneaky](../../../../etc/passwd)\n')

	// scroll check
	s.push('## After Media\n')
	s.push('If you can read this, scrolling past media works correctly.\n')
	s.push('The end.\n')

	return s.join('\n')
}

// -- stress test fixture --

function generateStressTest(): string {
	const s: string[] = []

	s.push('# Stress Test: Every Markdown Format\n')
	s.push(paragraph(2) + '\n')

	// inline formatting
	s.push('## Inline Formatting Showcase\n')
	s.push(
		`This paragraph has **bold text**, *italic text*, ***bold italic***, ~~strikethrough~~, \`inline code\`, and [a hyperlink](https://example.com). Here's more: ${paragraph(1)}\n`,
	)

	s.push('### Nested Emphasis\n')
	s.push(
		'**This is bold with *italic inside* and `code` too.** And *this is italic with **bold** nested*.\n',
	)

	// blockquote
	s.push('## Blockquotes\n')
	s.push('> ' + paragraph(1) + '\n')
	s.push('> > Nested blockquote: ' + pick(lorem, 1)[0] + '\n')
	s.push('> > > Triple nested: ' + pick(lorem, 1)[0] + '\n')
	s.push('> \n> — Someone Famous\n')

	// unordered list
	s.push('## Unordered Lists\n')
	for (let i = 0; i < 5; i++) {
		s.push(`- Item ${i + 1}: ${pick(lorem, 1)[0]}`)
	}
	s.push('')
	s.push('Nested list:\n')
	s.push('- Top level item')
	s.push('  - Second level with **bold**')
	s.push('    - Third level with `code`')
	s.push('      - Fourth level deep nesting')
	s.push('  - Another second level')
	s.push('- Back to top\n')

	// ordered list
	s.push('## Ordered Lists\n')
	for (let i = 1; i <= 8; i++) {
		s.push(`${String(i)}. Step ${String(i)}: ${pick(lorem, 1)[0]}`)
	}
	s.push('')

	// mixed list
	s.push('### Mixed List\n')
	s.push('1. First ordered')
	s.push('   - Unordered child')
	s.push('   - Another child')
	s.push('2. Second ordered')
	s.push('   1. Nested ordered')
	s.push('   2. Another nested')
	s.push('3. Third with `inline code` and **bold**\n')

	// task list
	s.push('## Task List\n')
	s.push('- [x] Completed task with **formatting**')
	s.push('- [ ] Pending task')
	s.push('- [x] Another done task')
	s.push('- [ ] Yet another pending: ' + pick(lorem, 1)[0])
	s.push('')

	// code blocks
	s.push('## Code Blocks\n')
	s.push('### TypeScript\n')
	s.push('```typescript')
	s.push(`interface Config {
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
	s.push('```\n')

	s.push('### Python\n')
	s.push('```python')
	s.push(`from dataclasses import dataclass
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
	s.push('```\n')

	s.push('### Rust\n')
	s.push('```rust')
	s.push(`use std::collections::HashMap;

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
	s.push('```\n')

	s.push('### Shell\n')
	s.push('```bash')
	s.push(`#!/bin/bash
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
	s.push('```\n')

	s.push('### JSON\n')
	s.push('```json')
	s.push(`{
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
	s.push('```\n')

	// tables
	s.push('## Tables\n')
	s.push('### Simple Table\n')
	s.push('| Feature | Status | Priority | Notes |')
	s.push('|---------|--------|----------|-------|')
	s.push('| File browser | Done | High | Phase 4 |')
	s.push('| Fuzzy filter | Done | High | fzf-style |')
	s.push('| Live preview | Done | Medium | Cache-first |')
	s.push('| File watcher | Done | Medium | Phase 5 |')
	s.push('| Kitty graphics | Done | Low | Phase 6 |')
	s.push('| Media modal | Done | Medium | Phase 6+ |')
	s.push('')

	s.push('### Wide Table with Long Content\n')
	s.push('| Method | Endpoint | Description | Auth | Rate Limit |')
	s.push('|--------|----------|-------------|------|------------|')
	s.push(
		'| GET | `/api/v2/users` | List all users with pagination and filtering | Bearer token | 100/min |',
	)
	s.push(
		'| POST | `/api/v2/users` | Create a new user account with email verification | Bearer token | 20/min |',
	)
	s.push(
		'| PUT | `/api/v2/users/:id` | Update user profile including avatar and preferences | Bearer token | 50/min |',
	)
	s.push(
		'| DELETE | `/api/v2/users/:id` | Soft-delete user account with 30-day recovery window | Admin only | 10/min |',
	)
	s.push(
		'| GET | `/api/v2/users/:id/activity` | Retrieve user activity log with date range filtering | Bearer token | 30/min |',
	)
	s.push('')

	// thematic breaks
	s.push('## Thematic Breaks\n')
	s.push(paragraph(1) + '\n')
	s.push('---\n')
	s.push(paragraph(1) + '\n')
	s.push('***\n')
	s.push(paragraph(1) + '\n')

	// media in stress test — auto-discovered
	const assets = discoverAssets()
	s.push('## Media\n')
	for (const file of [...assets.images, ...assets.videos, ...assets.audio]) {
		s.push(`![${altFromFilename(file)}](../test/assets/${file})\n`)
	}

	// links
	s.push('## Links\n')
	s.push('- [GitHub](https://github.com)')
	s.push('- [Rust Book](https://doc.rust-lang.org/book/)')
	s.push('- [MDN Web Docs](https://developer.mozilla.org)\n')

	// headings
	s.push('## Heading Levels\n')
	s.push('# Heading 1\n')
	s.push('## Heading 2\n')
	s.push('### Heading 3\n')
	s.push('#### Heading 4\n')
	s.push('##### Heading 5\n')
	s.push('###### Heading 6\n')

	// dense paragraphs
	s.push('## Dense Paragraphs for Scroll Testing\n')
	for (let i = 0; i < 10; i++) {
		s.push(paragraph(4) + '\n')
	}

	// complex nesting
	s.push('## Complex Nesting\n')
	s.push('> Here is a blockquote containing a code block:\n>')
	s.push('> ```javascript')
	s.push('> function fibonacci(n) {')
	s.push('>   if (n <= 1) return n')
	s.push('>   return fibonacci(n - 1) + fibonacci(n - 2)')
	s.push('> }')
	s.push('> ```')
	s.push('>')
	s.push('> And a list inside the quote:')
	s.push('>')
	s.push('> 1. First item')
	s.push('> 2. Second item')
	s.push('>    - Nested bullet')
	s.push('> 3. Third item\n')

	// code-heavy paragraph
	s.push('## Code-Heavy Paragraph\n')
	s.push(
		'The `processMarkdown()` function calls `remark.parse()` to generate an `mdast` tree, then `remark-rehype` converts it to `hast`, which `rehype-highlight` annotates with `<span class="hljs-*">` tokens. The `rehype-ir` compiler walks the `hast` tree and emits `IRNode[]` — a discriminated union of `HeadingNode`, `ParagraphNode`, `CodeBlockNode`, `BlockquoteNode`, `ListNode`, `TableNode`, `ThematicBreakNode`, and `CustomNode<string>`. Finally `renderToOpenTUI()` maps each `IRNode` to the appropriate React component.\n',
	)

	// end
	s.push('## The End\n')
	s.push(paragraph(2) + '\n')
	s.push('---\n')
	s.push('*Generated by `scripts/gen-fixture.ts stress` for liham preview stress testing.*\n')

	return s.join('\n')
}

// -- cli --

const { positionals } = parseArgs({
	args: process.argv.slice(2),
	allowPositionals: true,
	strict: true,
})

const command = positionals[0] ?? 'all'
const valid = ['media', 'stress', 'all']

if (!valid.includes(command)) {
	console.error(`usage: bun scripts/gen-fixture.ts [${valid.join('|')}]`)
	process.exit(1)
}

console.log('generating fixtures:')

if (command === 'media' || command === 'all') {
	await writeFixture('media-test.md', generateMediaTest())
}

if (command === 'stress' || command === 'all') {
	await writeFixture('stress-test.md', generateStressTest())
}
