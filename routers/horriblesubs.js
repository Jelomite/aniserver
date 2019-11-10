import express from "express";
import {si} from "nyaapi";
import Webtorrent from "webtorrent";
import parseTorrent from "parse-torrent";
import parseRange from "range-parser";
import onFinished from "on-finished";
import rimraf from "rimraf";

const app = express();

// once the server starts, a new  webtorrent client will start.
let client;

// search for a specific show, will return all horriblesubs files uploaded to nyaa.si
export const getSources = async (term) => {
	return await si.searchAllByUser({
		user: "HorribleSubs",
		term,
		filter: 2,
	});
};

// destroy torrent download and delete files
const destroy = torrent => {
	torrent.destroy(() => {
		console.log("destroyed", torrent.path);
		rimraf(torrent.path, {maxBusyTries: 10}, e => {
			if (e) {
				console.error(e);
			} else {
				console.log("deleted file");
			}
		});
	});
};

// stream buffer with the required headers
const seekable = (stream, {length}, req, res) => {
	res.set("Accept-Ranges", "bytes");
	res.set("Conent-Length", length);

	const ranges = parseRange(length, req.headers.range);
	if (ranges === -1) {
		// unsatisfiable range
		res.set("Content-Range", "*/" + length);
		res.sendStatus(416);
	}

	const {start, end} = ranges[0];
	res.status(206);
	res.set("Content-Length", (end - start) + 1); //end is inclusive.
	res.set("Content-Range", `bytes ${start}-${end}/${length}`);

	stream.pipe(res);
};

app.use("/stream", (req, res, next) => {
	res.sendSeekable = (stream, config) => {
		seekable(stream, config, req, res);
	};
	next();
});

// GET localhost:port/horriblesubs/api/sources/one%20punch%20man?resolution=720p ->
// will return all of "one punch man" sources with 720p resolution.
// available resolutions: 480p, 720p, 1080p.
// if no resolution specified, it will return all resolutions.
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

// GET localhost:port/horriblesubs/stream/HASH
// the request must come from a <video> tag with the url for the stream to work.
app.get("/stream/:hash", (req, res) => {
	if (client) {
		console.log("deleting existing webtorrent");
		client.destroy();
	}

	client = new Webtorrent();
	// create a stream file in the request scope for later manipulation.
	let stream;
	const keepFile = req.headers["keep-file"] !== "keep";

	// let's add the new hash to our client.
	client.add(req.params.hash, torrent => {
		console.log(torrent.name);
		const file = torrent.files[0];

		torrent.on("download", () => console.log(torrent.progress, torrent.path));

		// delete the torrent when done.
		torrent.on("done", () => {
			if (onFinished.isFinished(req)) {
				torrent.destroy(() => {
					console.log("deleted", torrent.path);
					rimraf(torrent.path, {maxBusyTries: 10}, () => {});
				});
			}
		});

		try {
			const ranges = parseRange(file.length, req.headers.range);
			const {start, end} = ranges[0];
			stream = stream || file.createReadStream({start,	end});
			res.sendSeekable(stream, file);

		} catch {
			stream = stream || file.createReadStream();
			stream.pipe(res);
		}
		onFinished(res, () => {
			if (onFinished.isFinished(req) && keepFile) {
				destroy(torrent);
			}
		});
	});

	// this handles all of the errors, but we use it for one main error:
	// the client already has the torrent hash downloading...
	client.on("error", () => {
		const torrent = client.get(req.params.hash);
		const file = torrent ? torrent.files[0] : null;

		// if the file doesnt exist, this means the error we encountered isn't the main one.
		// TODO: log the unique error.
		if (!file) {
			console.log(torrent.files);
			return;
		}

		try {
			const ranges = parseRange(file.length, req.headers.range);
			const {start, end} = ranges[0];
			stream = stream || file.createReadStream({start,	end});
			res.sendSeekable(stream, file);

		} catch {
			stream = stream || file.createReadStream();
			stream.pipe(res);
		}
		onFinished(res, () => {
			if (onFinished.isFinished(req) && keepFile) {
				destroy(torrent);
			}
		});
	});
});

export default app;
