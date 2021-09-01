import fs from 'fs';
import { pathToFileURL } from 'url';
import sirv from 'sirv';
import { getRawBody } from '../node/index.js';
import { join, resolve } from 'path';
import { get_server } from '../server/index.js';
import { __fetch_polyfill } from '../../install-fetch.js';
import { SVELTE_KIT, SVELTE_KIT_ASSETS } from '../constants.js';
import { assertError } from '../../utils/assert.js';

/** @param {string} dir */
const mutable = (dir) =>
	sirv(dir, {
		etag: true,
		maxAge: 0
	});

/**
 * @param {{
 *   port: number;
 *   host?: string;
 *   config: import('types/config').ValidatedConfig;
 *   https?: boolean;
 *   cwd?: string;
 * }} opts
 */
export async function preview({
	port,
	host,
	config,
	https: use_https = false,
	cwd = process.cwd()
}) {
	__fetch_polyfill();

	const app_file = resolve(cwd, `${SVELTE_KIT}/output/server/app.js`);

	/** @type {import('types/app').App} */
	const app = await import(pathToFileURL(app_file).href);

	/** @type {import('sirv').RequestHandler} */
	const static_handler = fs.existsSync(config.kit.files.assets)
		? mutable(config.kit.files.assets)
		: (_req, _res, next) => {
				if (!next) throw new Error('No next() handler is available');
				return next();
		  };

	const assets_handler = sirv(resolve(cwd, `${SVELTE_KIT}/output/client`), {
		maxAge: 31536000,
		immutable: true
	});

	const has_asset_path = !!config.kit.paths.assets;

	app.init({
		paths: {
			base: config.kit.paths.base,
			assets: has_asset_path ? SVELTE_KIT_ASSETS : config.kit.paths.base
		},
		prerendering: false,
		read: (file) => fs.readFileSync(join(config.kit.files.assets, file))
	});

	/** @type {import('vite').UserConfig} */
	const vite_config = (config.kit.vite && config.kit.vite()) || {};

	const server = await get_server(use_https, vite_config, (req, res) => {
		if (req.url == null) {
			throw new Error('Invalid request url');
		}

		const initial_url = req.url;

		const render_handler = async () => {
			if (!req.method) throw new Error('Incomplete request');

			let body;

			try {
				body = await getRawBody(req);
			} catch (err) {
				assertError(err);
				res.statusCode = err.status || 400;
				return res.end(err.reason || 'Invalid request body');
			}

			const parsed = new URL(initial_url, 'http://localhost/');

			const rendered =
				parsed.pathname.startsWith(config.kit.paths.base) &&
				(await app.render({
					host: /** @type {string} */ (config.kit.host ||
						req.headers[config.kit.hostHeader || 'host']),
					method: req.method,
					headers: /** @type {import('types/helper').RequestHeaders} */ (req.headers),
					path: parsed.pathname.replace(config.kit.paths.base, ''),
					query: parsed.searchParams,
					rawBody: body
				}));

			if (rendered) {
				res.writeHead(rendered.status, rendered.headers);
				if (rendered.body) res.write(rendered.body);
				res.end();
			} else {
				res.statusCode = 404;
				res.end('Not found');
			}
		};

		if (has_asset_path) {
			if (initial_url.startsWith(SVELTE_KIT_ASSETS)) {
				// custom assets path
				req.url = initial_url.slice(SVELTE_KIT_ASSETS.length);
				assets_handler(req, res, () => {
					static_handler(req, res, render_handler);
				});
			} else {
				render_handler();
			}
		} else {
			assets_handler(req, res, () => {
				static_handler(req, res, render_handler);
			});
		}
	});

	await server.listen(port, host || '0.0.0.0');

	return Promise.resolve(server);
}
