import js from '@eslint/js'
import perfectionist from 'eslint-plugin-perfectionist'
import sonarjs from 'eslint-plugin-sonarjs'
import tseslint from 'typescript-eslint'

export default tseslint.config(
	js.configs.recommended,
	...tseslint.configs.recommended,
	sonarjs.configs.recommended,
	{
		plugins: { perfectionist },
		languageOptions: {
			parserOptions: {
				projectService: true,
			},
		},
		rules: {
			// --- imports ---
			// NOTE: Biome handles import sorting via organizeImports
			'perfectionist/sort-imports': 'off',

			// --- file size ---
			'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],

			// --- complexity ---
			'sonarjs/cognitive-complexity': ['error', 15],

			// --- sonarjs: tuned ---
			'sonarjs/no-small-switch': 'warn',
			'sonarjs/no-nested-conditional': 'warn',
			'sonarjs/no-nested-assignment': 'warn',
			'sonarjs/no-nested-functions': 'warn',
			'sonarjs/no-hardcoded-ip': 'warn',
			'sonarjs/todo-tag': 'warn',
			'sonarjs/prefer-read-only-props': 'warn',
			'sonarjs/deprecation': 'error',

			// --- typescript ---
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
			'@typescript-eslint/consistent-type-imports': [
				'error',
				{ prefer: 'type-imports', fixStyle: 'inline-type-imports' },
			],
			'@typescript-eslint/no-explicit-any': 'error',
			// TODO: enable once there's code to validate against
			// '@typescript-eslint/strict-boolean-expressions': [
			// 	'error',
			// 	{ allowString: false, allowNumber: false, allowNullableObject: true },
			// ],

			// --- type-aware ---
			'@typescript-eslint/no-floating-promises': 'error',
			'@typescript-eslint/await-thenable': 'error',
			'@typescript-eslint/no-unnecessary-type-assertion': 'error',
			'@typescript-eslint/prefer-nullish-coalescing': 'error',
			'@typescript-eslint/prefer-optional-chain': 'error',

			// --- core: stricter than home-jarvis ---
			'no-empty': ['error', { allowEmptyCatch: false }],
		},
	},
	{
		// react components naturally return different JSX element shapes
		files: ['**/*.tsx'],
		rules: {
			'sonarjs/function-return-type': 'off',
		},
	},
	// TODO: add eslint-plugin-boundaries once modules have content
	// enforce: cli -> app -> pipeline/components/browser/source/preview/watcher/theme
	//          pipeline -> components (not reverse)
	//          components -> theme
	{
		ignores: ['dist/', 'node_modules/', '**/*.js', '**/*.mjs'],
	},
)
