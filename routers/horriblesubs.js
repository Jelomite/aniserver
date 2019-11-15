import express from "express";
import {si} from "nyaapi";
import Webtorrent from "webtorrent";
import parseTorrent from "parse-torrent";
import parseRange from "range-parser";
import rimraf from "rimraf";

const app = express();

// once the server starts, a new  webtorrent client will start.
const client = new Webtorrent();

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
const seekable = (file, req, res) => {
	res.set("Accept-Ranges", "bytes");
	res.set("Conent-Length", file.length);
	const ranges = parseRange(file.length, req.headers.range || "");
	if (ranges === -1) {
		// unsatisfiable range
		res.set("Content-Range", "*/" + file.length);
		res.sendStatus(416);
	}

	const {start, end} = ranges[0];
	res.status(206);
	res.set("Content-Length", (end - start) + 1); //end is inclusive.
	res.set("Content-Range", `bytes ${start}-${end}/${file.length}`);

	const stream = file.createReadStream({start, end});
	stream.pipe(res);
};

app.use("/stream", (req, res, next) => {
	res.sendSeekable = file => {
		seekable(file, req, res);
	};
	next();
});

// validate the infoHash
const validateInfoHash = (req, res, next) => {
	if (req.params.hash === "" || typeof req.params.hash === "undefined") {
		res.status(500).send("invalid infoHash");
	} else {
		next();
	}
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
app.get("/stream/:hash", validateInfoHash, (req, res) => {
	try {
		const torrent = client.get(req.params.hash);
		const file = torrent.files[0]; // there's only one file in the torrent.
		try {
			res.sendSeekable(file);
		} catch {
			const stream = file.createReadStream();
			stream.pipe(res);
		}
	} catch (err) {
		res.status(500).send(err);
	}
});

app.get("/api/add/:hash", validateInfoHash, (req, res) => {
	client.add(req.params.hash, () => {
		res.status(200).send("Added torrent!");
		console.log("added torrent");
	});

	client.on("error", err => {
		res.status(500).send(err.toString());
	});
});

app.get("/api/delete/:hash", validateInfoHash, (req, res) => {
	console.log("destroying torrent");
	const torrent = client.get(req.params.hash);
	try {
		if (req.headers["keep-alive"] === "keep") {
			client.remove(torrent);
		} else {
			destroy(torrent);
		}
		res.status(200).send("Removed torrent");
	} catch (err) {
		res.status(500).send(err);
	}

});

export default app;
