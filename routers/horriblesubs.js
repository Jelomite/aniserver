import express from "express";
import {si} from "nyaapi";
import Webtorrent from "webtorrent";
import parseTorrent from "parse-torrent";
import sendSeekable from "send-seekable";

const app = express();
app.use(sendSeekable);

// once the server starts, a new  webtorrent client will start.
let client = new Webtorrent();

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
	// create a stream file in the request scope for later manipulation.
	let stream;

	// let's add the new hash to our client.
	client.add(req.params.hash, torrent => {
		console.log(torrent.name);
		const file = torrent.files[0];
		// create a streamable buffer and stream it over the connection.
		// all of the headers are being manipulated by the `sendSeekable` middleware.
		stream = file.createReadStream();
		res.sendSeekable(stream, {length: file.length});
	});

	// this handles all of the errors, but we use it for one main error:
	// the client already has the torrent hash downloading...
	client.on("error", () => {
		// we find this file with some filtering.
		const fileExists = client.torrents.filter(({infoHash}) => req.params.hash === infoHash);
		const file = fileExists[0].files[0];

		// if the file doesnt exist, this means the error we encountered isn't the main one.
		// TODO: log the unique error.
		if (!file) {
			// for now, returning is good enough.
			return;
		}
		// what if we dont have a stream? this means the torrent client is already handling the file.
		if (!stream) {
			// we create a new stream buffer for piping.
			stream = file.createReadStream();
		}

		// option A: the server already started streaming the file to this specific request
		// option B: it doesn't.

		// if it's options B, the try succeeds and we sendSeekable the stream with all the headers.
		// if it's option A, the try failes and we pipe the stream without all of the headers.
		try {
			res.sendSeekable(stream, {length: file.length});
		} catch {
			stream.pipe(res);
		}
	});

	// once the request has finished, we just log it.
	req.on("close", () => {
		console.log("closed");
	});
});

export default app;
