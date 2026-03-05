import type { BaseNodeProps } from '../../types/components.ts'

// fallback for unknown elements — renders children as-is in a column box.
// rehype-terminal ensures children are wrapped correctly for OpenTUI.
export function Fallback({ children }: Readonly<BaseNodeProps>) {
	if (children == null) return null

	return <box style={{ flexDirection: 'column' }}>{children}</box>
}
