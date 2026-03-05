import type { ReactNode } from 'react'

import { useKeyboard, useRenderer } from '@opentui/react'

interface AppProps {
	content: ReactNode
}

export function App({ content }: Readonly<AppProps>) {
	const renderer = useRenderer()

	useKeyboard((key) => {
		if (key.name === 'q' || key.name === 'escape') {
			renderer?.destroy()
			process.exit(0)
		}
	})

	return (
		<scrollbox
			focused
			style={{
				rootOptions: { width: '100%', height: '100%' },
			}}
		>
			<box style={{ flexDirection: 'column', padding: 1 }}>{content}</box>
		</scrollbox>
	)
}
