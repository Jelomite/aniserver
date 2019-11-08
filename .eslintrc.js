module.exports = {
	env: {
		es6: true,
		node: true,
		browser: true,
	},
	extends: ["eslint:recommended"],
	parser: "babel-eslint",
	parserOptions: {
		ecmaVersion: 2018,
		sourceType: "module",
	},
	rules: {
		"indent": ["error", "tab"],
		"linebreak-style": ["error", "unix"],
		"quotes": ["error", "double"],
		"semi": ["error", "always"],
		"no-unused-vars": [1, {"vars": "all", "args": "after-used"}],
		"no-console": "off",
		"space-before-blocks": 1,
		"arrow-spacing": 1,
		"no-multiple-empty-lines": [1, {"max": 1}],
		"array-bracket-spacing": 2,
		"object-curly-spacing": 2,
		"space-infix-ops": 2,
		"comma-dangle": [1, "always-multiline"],
	},
};
