const fs = require('fs');
const path = require('path');
const toml = require('toml');
const glob = require('tiny-glob/sync');
const { prerender } = require('@sveltejs/app-utils');

const mkdirp = dir => {
	try {
		fs.mkdirSync(dir, { recursive: true });
	} catch {}
}

module.exports = async function builder({
	input,
	manifest,
	log
}) {
	let netlify_config;

	if (fs.existsSync('netlify.toml')) {
		try {
			netlify_config = toml.parse(fs.readFileSync('netlify.toml', 'utf-8'));
		} catch (err) {
			err.message = `Error parsing netlify.toml: ${err.message}`;
			throw err;
		}
	} else {
		throw new Error('Missing a netlify.toml file. Consult https://github.com/sveltejs/adapter-netlify#configuration');
	}

	if (!netlify_config.build || !netlify_config.build.publish || !netlify_config.build.functions) {
		throw new Error('You must specify build.publish and build.functions in netlify.toml. Consult https://github.com/sveltejs/adapter-netlify#configuration');
	}

	const publish = path.resolve(netlify_config.build.publish);
	const functions = path.resolve(netlify_config.build.functions);

	mkdirp(`${publish}/_app`);
	mkdirp(`${functions}/render`);

	// copy everything in `static`
	glob('**/*', { cwd: 'static', filesOnly: true }).forEach(file => {
		mkdirp(path.dirname(`${publish}/${file}`));
		fs.copyFileSync(`static/${file}`, `${publish}/${file}`);
	});

	// copy client code
	const client_code = path.resolve(input, 'client');
	glob('**/*', { cwd: client_code, filesOnly: true }).forEach(file => {
		if (file[0] !== '.') {
			mkdirp(path.dirname(`${publish}/_app/${file}`));
			fs.copyFileSync(`${client_code}/${file}`, `${publish}/_app/${file}`);
		}
	});

	// prerender
	log.minor('Prerendering...');
	await prerender({
		input,
		output: publish,
		manifest,
		log
	});

	// copy server code
	const server_code = path.resolve(input, 'server');
	glob('**/*', { cwd: server_code, filesOnly: true }).forEach(file => {
		if (file[0] !== '.') {
			mkdirp(path.dirname(`${functions}/render/${file}`));
			fs.copyFileSync(`${server_code}/${file}`, `${functions}/render/${file}`);
		}
	});

	// copy the renderer
	fs.copyFileSync(path.resolve(__dirname, 'render.js'), `${functions}/render/index.js`);

	// generate manifest
	const written_manifest = `module.exports = {
		layout: ${JSON.stringify(manifest.layout)},
		error: ${JSON.stringify(manifest.error)},
		components: ${JSON.stringify(manifest.components)},
		pages: [
			${manifest.pages.map(page => `{ pattern: ${page.pattern}, parts: ${JSON.stringify(page.parts)} }`).join(',\n\t\t\t')}
		],
		server_routes: [
			${manifest.server_routes.map(route => `{ name: '${route.name}', pattern: ${route.pattern}, file: '${route.file}', params: ${JSON.stringify(route.params)} }`).join(',\n\t\t\t')}
		]
	};`.replace(/^\t/gm, '');

	fs.writeFileSync(`${functions}/render/manifest.js`, written_manifest);

	// copy client manifest
	fs.copyFileSync(`${input}/client.json`, `${functions}/render/client.json`);

	// copy template
	fs.writeFileSync(`${functions}/render/template.js`, `module.exports = ${JSON.stringify(fs.readFileSync('src/app.html', 'utf-8'))};`);

	// create _redirects
	fs.writeFileSync(`${publish}/_redirects`, `/* /.netlify/functions/render 200`);
};