module.exports = {
	root: true,
	parser: "@typescript-eslint/parser",
	parserOptions: {
		project: "./tsconfig.json",
		ecmaVersion: 2020,
		sourceType: "module",
	},
	plugins: ["@typescript-eslint"],
	extends: [
		"eslint:recommended",
		"plugin:@typescript-eslint/recommended",
		"plugin:obsidianmd/recommended",
	],
	rules: {
		"no-unused-vars": "off",
		"@typescript-eslint/no-unused-vars": ["error", { args: "none" }],
		"@typescript-eslint/ban-ts-comment": "off",
		"no-prototype-builtins": "off",
	},
	ignorePatterns: ["node_modules/**", "main.js", "*.mjs"],
};
