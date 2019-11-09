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
	client = new Webtorrent();
	// create a stream file in the request scope for later manipulation.
	let stream;

	// let's add the new hash to our client.
	client.add(req.params.hash, torrent => {
		console.log(torrent.name);
		const file = torrent.files[0];

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
			// try setting up the required headers for the partial content streaming protocol.
			res.set("Accept-Ranges", "bytes");
			res.set("Conent-Length", file.length);

			const ranges = parseRange(file.length, req.headers.range);
			if (ranges === -1) {
			//unsatisfiable range
				res.set("Content-Range", "*/" + file.length);
				res.sendStatus(416);
			}

			const {start, end} = ranges[0];
			res.status(206);
			res.set("Content-Length", (end - start) + 1); //end is inclusive.
			res.set("Content-Range", `bytes ${start}-${end}/${file.length}`);
			stream = file.createReadStream({
				start,
				end,
			});

		} catch {
			stream = file.createReadStream();
		}
		// create a streamable buffer and stream it over the connection.
		stream.pipe(res);
		onFinished(res, () => {
			if (onFinished.isFinished(req)) {
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
			// for now, returning is good enough.
			// console.error("-------------------------------------------------\n", e);
			console.log(torrent.files);
			return;
		}
		// what if we dont have a stream? this means the torrent client is already handling the file.

		// option A: the server already started streaming the file to this specific request
		// option B: it doesn't.

		// if it's options B, the try succeeds and we sendSeekable the stream with all the headers.
		// if it's option A, the try failes and we pipe the stream without all of the headers.
		try {
			// trying to setup the headers, as with the initial part.
			res.set("Accept-Ranges", "bytes");
			res.set("Conent-Length", file.length);

			const ranges = parseRange(file.length, req.headers.range);
			if (ranges === -1) {
				//unsatisfiable range
				res.set("Content-Range", "*/" + file.length);
				res.sendStatus(416);
			}

			const {start, end} = ranges[0];
			res.status(206);
			res.set("Content-Length", (end - start) + 1); //end is inclusive.
			res.set("Content-Range", `bytes ${start}-${end}/${file.length}`);
			if (!stream) {
				// we create a new stream buffer for piping if there isn't one.
				stream = file.createReadStream({
					start,
					end,
				});
			}

		} catch {
			if (!stream) {
				// we create a new stream buffer for piping if there isn't one.
				stream = file.createReadStream();
			}
		}
		stream.pipe(res);
		onFinished(res, () => {
			if (onFinished.isFinished(req)) {
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
			}
		});
	});
});

export default app;
