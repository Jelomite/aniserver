import express from "express";
import {si} from "nyaapi";
import Webtorrent from "webtorrent";
import parseTorrent from "parse-torrent";
import sendSeekable from "send-seekable";

let client = new Webtorrent();

export const getSources = async (term) => {
	return await si.searchAllByUser({
		user: "HorribleSubs",
		term,
		filter: 2,
	});
};

const app = express();
app.use(sendSeekable);

app.get("/api/sources/:slug", (req, res) => {
	getSources(req.params.slug).then(data => {
		const hashedSources = data.map(file => (
			{...file,
				links: {...file.links, hash: parseTorrent(file.links.magnet).infoHash},
			}));

		const resolutionFiltered = hashedSources.filter(file => {
			const resolution = file.name.split("[")[2].split("]")[0];
			return resolution === req.query.resolution;
		});

		res.send(req.query.resolution ? resolutionFiltered : hashedSources);
	});
});

app.get("/stream/:hash", (req, res) => {
	let stream;

	client.on("error", () => {
		const fileExists = client.torrents.filter(({infoHash}) => req.params.hash === infoHash);
		const file = fileExists[0].files[0];

		if (!file) {
			return;
		}
		if (!stream) {
			stream = file.createReadStream();
		}

		try {
			res.sendSeekable(stream, {length: file.length});
		} catch {
			stream.pipe(res);
		}
	});

	client.add(req.params.hash, torrent => {
		console.log(torrent.name);
		const file = torrent.files[0];
		stream = file.createReadStream();
		res.sendSeekable(stream, {length: file.length});
	});

	req.on("close", () => {
		console.log("closed");
	});
});

export default app;
